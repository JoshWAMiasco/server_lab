import { isIP } from "node:net";
import { z } from "zod";
import { FIREWALL_LOGGING_LEVELS, FIREWALL_POLICIES, FIREWALL_POLICY_DIRECTIONS, FIREWALL_PROTOCOLS, FIREWALL_RULE_ACTIONS, FIREWALL_RULE_DIRECTIONS, type FirewallRuleInput, type SecurityAction } from "@/lib/security/security-types";

/*
 * The one validation used by the web action, the collector and the root helper. Every value that
 * reaches `ufw` or `fail2ban-client` passes through here first, and the helper validates again
 * before running anything, so a request written by a compromised serverlab user is held to the
 * same rules.
 */

const JAIL_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const INTERFACE_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,15}$/;
const PORT_PATTERN = /^(\d{1,5})(?::(\d{1,5}))?$/;
const COMMENT_PATTERN = /^[A-Za-z0-9 _.,:/()@+-]{1,64}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const MAXIMUM_RULE_TEXT_LENGTH = 300;

/** Whether `value` is a single IPv4 or IPv6 address. */
export function isIpAddress(value: string): boolean {
  return isIP(value) !== 0;
}

/** Whether `value` is an IP address or a CIDR network such as `100.64.0.0/10` or `fd7a:115c:a1e0::/48`. */
export function isAddressOrNetwork(value: string): boolean {
  const [address = "", prefixText, ...extraParts] = value.split("/");
  if (extraParts.length > 0) return false;
  const family = isIP(address);
  if (family === 0) return false;
  if (prefixText === undefined) return true;
  if (!/^\d{1,3}$/.test(prefixText)) return false;
  const prefixLength = Number(prefixText);
  return prefixLength >= 0 && prefixLength <= (family === 4 ? 32 : 128);
}

/** A port (`22`) or range (`6000:6007`) between 1 and 65535, with the range's start below its end. */
export function isValidPort(value: string): boolean {
  const match = PORT_PATTERN.exec(value);
  if (!match) return false;
  const firstPort = Number(match[1]);
  const lastPort = match[2] === undefined ? firstPort : Number(match[2]);
  return firstPort >= 1 && lastPort <= 65_535 && firstPort <= lastPort && (match[2] === undefined || firstPort < lastPort);
}

const jailNameSchema = z.string().regex(JAIL_NAME_PATTERN, "Jail names use letters, digits, dots, dashes and underscores.");
const singleAddressSchema = z.string().trim().refine(isIpAddress, "Enter one IPv4 or IPv6 address, like 203.0.113.7.");

const optionalText = (schema: z.ZodType<string, string>) =>
  z
    .string()
    .nullable()
    .transform((value) => (value === null || value.trim() === "" ? null : value.trim()))
    .pipe(schema.nullable());

export const firewallRuleInputSchema = z
  .object({
    action: z.enum(FIREWALL_RULE_ACTIONS),
    direction: z.enum(FIREWALL_RULE_DIRECTIONS),
    interfaceName: optionalText(z.string().regex(INTERFACE_NAME_PATTERN, "Interface names are up to 15 letters, digits, dots, dashes or underscores, like tailscale0.")),
    fromAddress: optionalText(z.string().refine(isAddressOrNetwork, "Enter an IP address or a network like 192.168.1.0/24.")),
    port: optionalText(z.string().refine(isValidPort, "Enter a port from 1 to 65535, or a range like 6000:6007.")),
    protocol: z.enum(FIREWALL_PROTOCOLS),
    comment: optionalText(z.string().regex(COMMENT_PATTERN, "Comments are up to 64 letters, digits, spaces and . , : / ( ) @ + - _ characters.")),
  })
  .strict()
  .superRefine((rule: FirewallRuleInput, context) => {
    if (rule.port?.includes(":") && rule.protocol === "any") context.addIssue({ code: "custom", path: ["protocol"], message: "A port range needs a protocol: choose TCP or UDP." });
    if (rule.action === "limit" && rule.direction !== "in") context.addIssue({ code: "custom", path: ["action"], message: "Limit only works on incoming traffic." });
    if (!rule.interfaceName && !rule.fromAddress && !rule.port) context.addIssue({ code: "custom", path: ["port"], message: "Give the rule a port, a source address or an interface. A rule with none of them would match all traffic." });
  });

export const securityActionSchema: z.ZodType<SecurityAction> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("snapshot") }).strict(),
  z.object({ kind: z.literal("fail2ban-ban"), jail: jailNameSchema, address: singleAddressSchema }).strict(),
  z.object({ kind: z.literal("fail2ban-unban"), jail: jailNameSchema, address: singleAddressSchema }).strict(),
  z.object({ kind: z.literal("firewall-enable") }).strict(),
  z.object({ kind: z.literal("firewall-disable") }).strict(),
  z.object({ kind: z.literal("firewall-default"), direction: z.enum(FIREWALL_POLICY_DIRECTIONS), policy: z.enum(FIREWALL_POLICIES) }).strict(),
  z.object({ kind: z.literal("firewall-logging"), level: z.enum(FIREWALL_LOGGING_LEVELS) }).strict(),
  z.object({ kind: z.literal("firewall-add-rule"), rule: firewallRuleInputSchema }).strict(),
  z.object({ kind: z.literal("firewall-delete-rule"), ruleNumber: z.number().int().min(1).max(10_000), expectedRuleText: z.string().min(1).max(MAXIMUM_RULE_TEXT_LENGTH) }).strict(),
]);

/** The file the collector drops in the helper's inbox. */
export const hostActionRequestSchema = z
  .object({
    requestId: z.string().regex(REQUEST_ID_PATTERN),
    action: securityActionSchema,
  })
  .strict();

export type HostActionRequest = z.infer<typeof hostActionRequestSchema>;

/** Collapses runs of whitespace so rule lines compare equal however ufw pads its columns. */
export function normalizeRuleText(ruleText: string): string {
  return ruleText.replaceAll(/\s+/g, " ").trim();
}
