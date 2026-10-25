import { describe, expect, test } from "vitest";
import { readFixture } from "./read-fixture";
import {
  mergeUpstreams,
  parseNginxConfig,
  parseNginxDirectives,
  resolveProxyPassPort,
  tokenizeNginxConfig,
} from "./parse-nginx-config";

describe("tokenizeNginxConfig", () => {
  test("splits words, braces and semicolons and drops comments", () => {
    const tokens = tokenizeNginxConfig("server { # comment { ;\n  listen 80; }");
    expect(tokens.map((token) => (token.kind === "word" ? token.value : token.kind))).toEqual([
      "server",
      "open",
      "listen",
      "80",
      "semicolon",
      "close",
    ]);
    expect(tokens[2]?.line).toBe(2);
  });

  test("handles quotes, escapes, empty strings and # inside words", () => {
    const text = String.raw`add_header X "say \"hi\"; {x}" '' a\.b return https://x/#top;`;
    const words = tokenizeNginxConfig(text)
      .filter((token) => token.kind === "word")
      .map((token) => token.value);
    expect(words).toEqual(["add_header", "X", 'say "hi"; {x}', "", String.raw`a\.b`, "return", "https://x/#top"]);
  });

  test("keeps ${variable} braces inside a word", () => {
    const words = tokenizeNginxConfig("server_name ${hostname}.internal;").map((token) =>
      token.kind === "word" ? token.value : token.kind,
    );
    expect(words).toEqual(["server_name", "${hostname}.internal", "semicolon"]);
  });
});

describe("parseNginxDirectives", () => {
  test("builds nested blocks", () => {
    const [http] = parseNginxDirectives(tokenizeNginxConfig("http { server { listen 80; } }"));
    expect(http?.name).toBe("http");
    expect(http?.block?.[0]?.block?.[0]).toEqual({ name: "listen", parameters: ["80"], block: null, line: 1 });
  });

  test("tolerates unbalanced braces", () => {
    expect(() => parseNginxDirectives(tokenizeNginxConfig("} server { listen 80;"))).not.toThrow();
    expect(parseNginxConfig("server { listen 81;", "broken.conf").sites[0]?.listenPorts).toEqual([81]);
  });
});

describe("parseNginxConfig: Ubuntu nginx.conf", () => {
  const result = parseNginxConfig(readFixture("nginx-ubuntu-nginx.conf"), "/etc/nginx/nginx.conf");

  test("returns the raw include arguments and no sites", () => {
    expect(result.includes).toEqual([
      "/etc/nginx/modules-enabled/*.conf",
      "/etc/nginx/mime.types",
      "/etc/nginx/conf.d/*.conf",
      "/etc/nginx/sites-enabled/*",
    ]);
    expect(result.sites).toEqual([]);
  });

  test("ignores stream servers and upstreams", () => {
    expect(result.upstreams).toEqual({});
  });
});

describe("parseNginxConfig: Ubuntu sites-available/default", () => {
  test("reads the default static site", () => {
    const { sites } = parseNginxConfig(readFixture("nginx-ubuntu-sites-available-default.conf"), "/etc/nginx/sites-enabled/default");
    expect(sites).toEqual([
      {
        serverNames: ["_"],
        listenPorts: [80],
        listenAddresses: ["*", "::"],
        isSsl: false,
        isDefaultServer: true,
        staticRoot: "/var/www/html",
        proxyPassPort: null,
        proxyPassTarget: null,
        sourceFile: "/etc/nginx/sites-enabled/default",
      },
    ]);
  });
});

describe("parseNginxConfig: homelab sites-enabled", () => {
  const sourceFile = "/etc/nginx/sites-enabled/homelab.conf";
  const result = parseNginxConfig(readFixture("nginx-sites-enabled-homelab.conf"), sourceFile);
  const siteNamed = (serverName: string) => result.sites.find((site) => site.serverNames.includes(serverName));

  test("finds every server block, skipping the commented-out one", () => {
    expect(result.sites.map((site) => site.serverNames[0])).toEqual([
      "_",
      "jellyfin.tail1234.ts.net",
      "status.home.arpa",
      "docs.home.arpa",
      "photos.home.arpa",
      "${hostname}.internal",
      "grafana.home.arpa",
      "vault.home.arpa",
    ]);
  });

  test("collects upstream ports, including IPv6 and unix sockets", () => {
    expect(result.upstreams).toEqual({ jellyfin_upstream: 8096, immich: 2283, gunicorn_socket: null });
  });

  test("collects server-level includes", () => {
    expect(result.includes).toEqual(["snippets/ssl-params.conf"]);
  });

  test("redirect server: default, both stacks, no proxy", () => {
    expect(siteNamed("_")).toMatchObject({
      listenPorts: [80],
      listenAddresses: ["*", "::"],
      isDefaultServer: true,
      isSsl: false,
      proxyPassTarget: null,
      staticRoot: null,
    });
  });

  test("reverse proxy through a named upstream on a tailnet address", () => {
    expect(siteNamed("jellyfin.tail1234.ts.net")).toEqual({
      serverNames: ["jellyfin.tail1234.ts.net", "media.home.arpa"],
      listenPorts: [8096],
      listenAddresses: ["100.101.1.2"],
      isSsl: true,
      isDefaultServer: false,
      staticRoot: null,
      proxyPassPort: 8096,
      proxyPassTarget: "http://jellyfin_upstream",
      sourceFile,
    });
  });

  test("proxy_pass next to nested if blocks and quoted braces", () => {
    expect(siteNamed("status.home.arpa")).toMatchObject({
      listenPorts: [3001],
      isSsl: true,
      proxyPassTarget: "http://localhost:3001/",
      proxyPassPort: 3001,
    });
  });

  test("static site with a server-level root", () => {
    expect(siteNamed("docs.home.arpa")).toMatchObject({
      serverNames: ["docs.home.arpa", "wiki.home.arpa"],
      listenPorts: [8080],
      listenAddresses: ["*", "::"],
      staticRoot: "/var/www/docs/public",
      proxyPassTarget: null,
    });
  });

  test("upstream with an IPv6 server and an IPv6 listen", () => {
    expect(siteNamed("photos.home.arpa")).toMatchObject({
      listenPorts: [2283],
      listenAddresses: ["100.101.1.2", "fd7a:115c:a1e0::1a01:202"],
      proxyPassPort: 2283,
    });
  });

  test("skips unix listen sockets and resolves a unix upstream to no port", () => {
    expect(siteNamed("${hostname}.internal")).toMatchObject({
      listenPorts: [9100],
      listenAddresses: ["127.0.0.1"],
      proxyPassTarget: "http://gunicorn_socket",
      proxyPassPort: null,
    });
  });

  test("proxy_pass built from a variable has no port", () => {
    expect(siteNamed("grafana.home.arpa")).toMatchObject({ proxyPassTarget: "$grafana_backend", proxyPassPort: null });
  });

  test("an upstream defined in another file resolves once passed in", () => {
    expect(siteNamed("vault.home.arpa")?.proxyPassPort).toBeNull();
    const merged = mergeUpstreams(result.upstreams, { vaultwarden_backend: 8222 });
    const reparsed = parseNginxConfig(readFixture("nginx-sites-enabled-homelab.conf"), sourceFile, merged);
    expect(reparsed.sites.find((site) => site.serverNames.includes("vault.home.arpa"))?.proxyPassPort).toBe(8222);
  });
});

describe("parseNginxConfig: listen forms", () => {
  test.each([
    ["listen 80;", [80], ["*"], false, false],
    ["listen 443 ssl;", [443], ["*"], true, false],
    ["listen 100.101.1.2:8096 ssl;", [8096], ["100.101.1.2"], true, false],
    ["listen [::]:443 ssl default_server;", [443], ["::"], true, true],
    ["listen *:8443 quic reuseport;", [8443], ["*"], true, false],
    ["listen 127.0.0.1;", [80], ["127.0.0.1"], false, false],
    ["listen localhost:8081 default;", [8081], ["localhost"], false, true],
    ["", [80], ["*"], false, false],
  ] as const)("%j", (listen, ports, addresses, isSsl, isDefaultServer) => {
    const [site] = parseNginxConfig(`server { ${listen} server_name a; }`, "test.conf").sites;
    expect(site).toMatchObject({ listenPorts: ports, listenAddresses: addresses, isSsl, isDefaultServer });
  });

  test("legacy `ssl on;` marks the site as SSL", () => {
    expect(parseNginxConfig("server { listen 443; ssl on; }", "test.conf").sites[0]?.isSsl).toBe(true);
  });

  test("root inside location / wins over the server root", () => {
    const text = "server { root /srv/a; location = / { root /srv/b; } }";
    expect(parseNginxConfig(text, "test.conf").sites[0]?.staticRoot).toBe("/srv/b");
  });
});

describe("resolveProxyPassPort", () => {
  test.each([
    ["http://127.0.0.1:8096", 8096],
    ["http://localhost:3000/", 3000],
    ["http://[::1]:9000/api/", 9000],
    ["http://127.0.0.1", 80],
    ["https://localhost", 443],
    ["http://app.internal", 80],
    ["http://backend", null],
    ["http://unix:/run/app.sock:/", null],
    ["http://$upstream_host:8080", null],
    ["$backend", null],
  ] as const)("%s → %s", (target, port) => {
    expect(resolveProxyPassPort(target)).toBe(port);
  });

  test("resolves names through the upstream map", () => {
    expect(resolveProxyPassPort("http://backend", { backend: 5000 })).toBe(5000);
  });
});

describe("mergeUpstreams", () => {
  test("later maps win on a clash", () => {
    expect(mergeUpstreams({ app: 1, other: 2 }, { app: 3 })).toEqual({ app: 3, other: 2 });
  });
});
