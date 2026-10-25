import { isIP } from "node:net";
import type { NginxSite } from "../types";

/*
 * nginx config parsing for "websites hosted". A character-level tokenizer (modelled on nginx's own
 * ngx_conf_read_token) feeds a small recursive-descent parser; no regular expression ever runs over
 * a whole file. Unbalanced braces never throw: the parser keeps whatever it could read.
 */

export type NginxToken =
  | { kind: "word"; value: string; line: number }
  | { kind: "open" | "close" | "semicolon"; line: number };

export interface NginxDirective {
  name: string;
  parameters: string[];
  block: NginxDirective[] | null;
  line: number;
}

export type NginxUpstreams = Record<string, number | null>;

export interface NginxConfigParseResult {
  sites: NginxSite[];
  includes: string[];
  upstreams: NginxUpstreams;
}

const ESCAPED_CHARACTERS: Record<string, string> = { '"': '"', "'": "'", "\\": "\\", t: "\t", r: "\r", n: "\n" };
const WHITESPACE = new Set([" ", "\t", "\r", "\n", "\f", "\v"]);

/*
 * Words may be quoted with ' or " (quotes are removed, `''` yields an empty word). A backslash
 * escapes the next character everywhere: \" \' \\ \t \r \n are unescaped, any other pair is kept
 * verbatim (so regexes like `\.php$` survive). `#` starts a comment only at the start of a word,
 * so `https://example.com/#top` stays one word. `${name}` variables do not open a block.
 */
export function tokenizeNginxConfig(text: string): NginxToken[] {
  const tokens: NginxToken[] = [];
  let position = 0;
  let line = 1;
  let word = "";
  let hasWord = false;
  let wordLine = 1;

  const startWord = (): void => {
    if (!hasWord) {
      hasWord = true;
      wordLine = line;
    }
  };
  const flushWord = (): void => {
    if (hasWord) {
      tokens.push({ kind: "word", value: word, line: wordLine });
      word = "";
      hasWord = false;
    }
  };
  const readEscape = (): string => {
    const escaped = text[position + 1] ?? "";
    if (escaped === "\n") {
      line += 1;
    }
    position += 2;
    return ESCAPED_CHARACTERS[escaped] ?? `\\${escaped}`;
  };

  while (position < text.length) {
    const character = text[position] ?? "";
    if (character === "\\") {
      startWord();
      word += readEscape();
      continue;
    }
    if (character === '"' || character === "'") {
      startWord();
      position += 1;
      while (position < text.length && text[position] !== character) {
        if (text[position] === "\\") {
          word += readEscape();
          continue;
        }
        if (text[position] === "\n") {
          line += 1;
        }
        word += text[position];
        position += 1;
      }
      position += 1;
      continue;
    }
    if (WHITESPACE.has(character)) {
      flushWord();
      if (character === "\n") {
        line += 1;
      }
      position += 1;
      continue;
    }
    if (character === "#" && !hasWord) {
      while (position < text.length && text[position] !== "\n") {
        position += 1;
      }
      continue;
    }
    if (character === "{" && hasWord && word.endsWith("$")) {
      while (position < text.length && text[position] !== "}") {
        word += text[position];
        position += 1;
      }
      word += "}";
      position += 1;
      continue;
    }
    if (character === "{" || character === "}" || character === ";") {
      flushWord();
      tokens.push({ kind: character === "{" ? "open" : character === "}" ? "close" : "semicolon", line });
      position += 1;
      continue;
    }
    startWord();
    word += character;
    position += 1;
  }
  flushWord();
  return tokens;
}

/* Builds the directive tree. A stray `}` at the top level is ignored; unclosed blocks are closed at end of input. */
export function parseNginxDirectives(tokens: NginxToken[]): NginxDirective[] {
  const root: NginxDirective[] = [];
  const stack: NginxDirective[][] = [root];
  let pending: string[] = [];
  let pendingLine = 0;

  const emit = (block: NginxDirective[] | null): NginxDirective | null => {
    const [name, ...parameters] = pending;
    pending = [];
    if (name === undefined) {
      return null;
    }
    const directive: NginxDirective = { name, parameters, block, line: pendingLine };
    (stack.at(-1) ?? root).push(directive);
    return directive;
  };

  for (const token of tokens) {
    if (token.kind === "word") {
      if (pending.length === 0) {
        pendingLine = token.line;
      }
      pending.push(token.value);
    } else if (token.kind === "semicolon") {
      emit(null);
    } else if (token.kind === "open") {
      const directive = emit([]);
      stack.push(directive?.block ?? []);
    } else {
      emit(null);
      if (stack.length > 1) {
        stack.pop();
      }
    }
  }
  emit(null);
  return root;
}

/* Contexts whose `server` blocks are TCP/UDP or mail proxies, not websites. */
const NON_HTTP_CONTEXTS = new Set(["stream", "mail"]);
const ROOT_LOCATION_MODIFIERS = new Set(["=", "^~"]);
const DEFAULT_HTTP_PORT = 80;

interface HostAndPort {
  host: string;
  port: number | null;
}

/* Splits `host:port`, `[v6]:port`, `host` or a bare `port` (when `bareNumberIsPort`). */
function splitHostAndPort(target: string, bareNumberIsPort: boolean): HostAndPort {
  if (target.startsWith("[")) {
    const closeIndex = target.indexOf("]");
    const host = target.slice(1, closeIndex === -1 ? undefined : closeIndex);
    const rest = closeIndex === -1 ? "" : target.slice(closeIndex + 1);
    return { host, port: rest.startsWith(":") ? Number(rest.slice(1)) : null };
  }
  if (bareNumberIsPort && /^\d+$/.test(target)) {
    return { host: "*", port: Number(target) };
  }
  const colonIndex = target.lastIndexOf(":");
  if (colonIndex === -1) {
    return { host: target, port: null };
  }
  return { host: target.slice(0, colonIndex), port: Number(target.slice(colonIndex + 1)) };
}

function upstreamPort(block: NginxDirective[]): number | null {
  const firstServer = block.find((directive) => directive.name === "server");
  const target = firstServer?.parameters[0];
  if (!target || target.startsWith("unix:")) {
    return null;
  }
  const { port } = splitHostAndPort(target, false);
  if (port === null) {
    return DEFAULT_HTTP_PORT;
  }
  return Number.isInteger(port) ? port : null;
}

function isRootLocation(directive: NginxDirective): boolean {
  if (directive.name !== "location" || !directive.block) {
    return false;
  }
  const [first, second] = directive.parameters;
  if (directive.parameters.length === 1) {
    return first === "/";
  }
  return directive.parameters.length === 2 && ROOT_LOCATION_MODIFIERS.has(first ?? "") && second === "/";
}

function findDirective(block: NginxDirective[], name: string): NginxDirective | undefined {
  return block.find((directive) => directive.name === name);
}

/* proxy_pass directly in `location /`, else the first one inside a nested `if` there. */
function findProxyPass(block: NginxDirective[]): string | null {
  const direct = findDirective(block, "proxy_pass");
  if (direct) {
    return direct.parameters[0] ?? null;
  }
  for (const directive of block) {
    if (directive.name === "if" && directive.block) {
      const nested = findProxyPass(directive.block);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

/*
 * Port a proxy_pass target talks to: an explicit port wins; otherwise a known upstream name
 * resolves through `upstreams`; an IP, `localhost` or dotted host name gets the scheme's default
 * port. Targets built from variables, unix sockets and unknown bare names (probably an upstream
 * defined in another file) yield null.
 */
export function resolveProxyPassPort(target: string, upstreams: NginxUpstreams = {}): number | null {
  const match = /^([a-z]+):\/\/([^/]+)/i.exec(target);
  const scheme = match?.[1]?.toLowerCase();
  const authority = match?.[2];
  if (!scheme || !authority || authority.startsWith("unix:") || authority.includes("$")) {
    return null;
  }
  const { host, port } = splitHostAndPort(authority, false);
  if (port !== null) {
    return Number.isInteger(port) ? port : null;
  }
  if (Object.hasOwn(upstreams, host)) {
    return upstreams[host] ?? null;
  }
  if (host === "localhost" || isIP(host) !== 0 || host.includes(".")) {
    return scheme === "https" || scheme === "grpcs" ? 443 : DEFAULT_HTTP_PORT;
  }
  return null;
}

interface ListenSpecification {
  address: string;
  port: number;
  isSsl: boolean;
  isDefaultServer: boolean;
}

/* `listen` forms: `80`, `443 ssl`, `100.101.1.2:8096 ssl`, `[::]:443 ssl default_server`, `localhost`. Unix sockets return null. */
function parseListen(parameters: string[]): ListenSpecification | null {
  const [target = "", ...flags] = parameters;
  if (!target || target.startsWith("unix:")) {
    return null;
  }
  const { host, port } = splitHostAndPort(target, true);
  const resolvedPort = port ?? DEFAULT_HTTP_PORT;
  if (!Number.isInteger(resolvedPort)) {
    return null;
  }
  return {
    address: host || "*",
    port: resolvedPort,
    isSsl: flags.includes("ssl") || flags.includes("quic"),
    isDefaultServer: flags.includes("default_server") || flags.includes("default"),
  };
}

function unique<Value>(values: Value[]): Value[] {
  return [...new Set(values)];
}

function buildSite(block: NginxDirective[], sourceFile: string, upstreams: NginxUpstreams): NginxSite {
  const listenDirectives = block.filter((directive) => directive.name === "listen");
  const listens = listenDirectives
    .map((directive) => parseListen(directive.parameters))
    .filter((listen): listen is ListenSpecification => listen !== null);
  if (listenDirectives.length === 0) {
    listens.push({ address: "*", port: DEFAULT_HTTP_PORT, isSsl: false, isDefaultServer: false });
  }
  const rootLocation = block.find((directive) => isRootLocation(directive));
  const locationBlock = rootLocation?.block ?? [];
  const proxyPassTarget = findProxyPass(locationBlock);
  const sslDirective = findDirective(block, "ssl");

  return {
    serverNames: unique(block.filter((directive) => directive.name === "server_name").flatMap((directive) => directive.parameters)),
    listenPorts: unique(listens.map((listen) => listen.port)),
    listenAddresses: unique(listens.map((listen) => listen.address)),
    isSsl: listens.some((listen) => listen.isSsl) || sslDirective?.parameters[0] === "on",
    isDefaultServer: listens.some((listen) => listen.isDefaultServer),
    staticRoot: findDirective(locationBlock, "root")?.parameters[0] ?? findDirective(block, "root")?.parameters[0] ?? null,
    proxyPassPort: proxyPassTarget === null ? null : resolveProxyPassPort(proxyPassTarget, upstreams),
    proxyPassTarget,
    sourceFile,
  };
}

interface CollectedConfig {
  serverBlocks: NginxDirective[][];
  includes: string[];
  upstreams: NginxUpstreams;
}

function collect(directives: NginxDirective[], collected: CollectedConfig): void {
  for (const directive of directives) {
    if (directive.name === "include") {
      collected.includes.push(...directive.parameters);
      continue;
    }
    if (!directive.block || NON_HTTP_CONTEXTS.has(directive.name)) {
      continue;
    }
    if (directive.name === "upstream") {
      const upstreamName = directive.parameters[0];
      if (upstreamName) {
        collected.upstreams[upstreamName] = upstreamPort(directive.block);
      }
      continue;
    }
    if (directive.name === "server") {
      collected.serverBlocks.push(directive.block);
    }
    collect(directive.block, collected);
  }
}

/*
 * Parses one nginx config file. `includes` holds the raw `include` arguments found anywhere in the
 * file (outside stream/mail), relative paths and globs untouched: the caller resolves them against
 * /etc/nginx and recurses. `upstreams` holds the upstream blocks defined in this file; pass the
 * upstreams from other files (see mergeUpstreams) to resolve proxy_pass names defined elsewhere.
 * Local definitions win over passed-in ones.
 */
export function parseNginxConfig(
  text: string,
  sourceFile: string,
  upstreams: NginxUpstreams = {},
): NginxConfigParseResult {
  const collected: CollectedConfig = { serverBlocks: [], includes: [], upstreams: {} };
  collect(parseNginxDirectives(tokenizeNginxConfig(text)), collected);
  const knownUpstreams = mergeUpstreams(upstreams, collected.upstreams);
  return {
    sites: collected.serverBlocks.map((block) => buildSite(block, sourceFile, knownUpstreams)),
    includes: collected.includes,
    upstreams: collected.upstreams,
  };
}

/* Merges upstream maps from several files; later maps win on a name clash. */
export function mergeUpstreams(...upstreamMaps: NginxUpstreams[]): NginxUpstreams {
  return Object.assign({}, ...upstreamMaps) as NginxUpstreams;
}
