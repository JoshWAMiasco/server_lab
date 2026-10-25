export const MAXIMUM_ICON_BYTES = 512 * 1024;

export const ACCEPTED_ICON_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"] as const;

export type AcceptedIconType = (typeof ACCEPTED_ICON_TYPES)[number];

/*
 * SVG is text that browsers can execute, so only plain drawings pass: no scripts, event handlers,
 * embedded documents, entity declarations or references outside the file (except data: images).
 */
const FORBIDDEN_SVG_PATTERNS: readonly RegExp[] = [
  /<\s*script/i,
  /<\s*foreignObject/i,
  /<\s*(iframe|embed|object|audio|video|animate|set|handler|listener)\b/i,
  /<!\s*(ENTITY|DOCTYPE)/i,
  /\son[a-z]+\s*=/i,
  /javascript\s*:/i,
  /(href|src)\s*=\s*["']\s*(?!#|data:image\/(png|jpeg|gif|webp);base64,)/i,
  /url\(\s*["']?\s*(?!#|data:image\/(png|jpeg|gif|webp);base64,)/i,
  /@import/i,
];

function startsWithBytes(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, byteIndex) => bytes[offset + byteIndex] === byte);
}

function detectRasterType(bytes: Uint8Array): AcceptedIconType | null {
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWithBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

function looksLikeSvg(text: string): boolean {
  const withoutPrologue = text
    .replace(/^﻿/, "")
    .replace(/<\?xml[^>]*\?>/i, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trimStart();
  return /^<svg[\s>]/i.test(withoutPrologue);
}

/**
 * Checks an uploaded icon. The type is decided from the file's own bytes (magic numbers, or an
 * `<svg>` root), never from the browser-supplied MIME type or file name.
 */
export function validateIconUpload(bytes: Uint8Array): { contentType: AcceptedIconType } | { errorMessage: string } {
  if (bytes.length === 0) return { errorMessage: "The file is empty." };
  if (bytes.length > MAXIMUM_ICON_BYTES) return { errorMessage: `Icons can be at most ${MAXIMUM_ICON_BYTES / 1024} KB.` };
  const rasterType = detectRasterType(bytes);
  if (rasterType) return { contentType: rasterType };
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!looksLikeSvg(text)) return { errorMessage: "Use a PNG, JPEG, WebP, GIF or SVG image." };
  if (FORBIDDEN_SVG_PATTERNS.some((pattern) => pattern.test(text))) return { errorMessage: "This SVG contains scripts, event handlers or external references, which are not allowed. Export it as a plain SVG or a PNG." };
  return { contentType: "image/svg+xml" };
}
