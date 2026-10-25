import { describe, expect, it } from "vitest";
import { MAXIMUM_ICON_BYTES, validateIconUpload } from "@/lib/lobby/custom-icon-validation";

const encode = (text: string) => new TextEncoder().encode(text);

describe("validateIconUpload", () => {
  it("detects raster types from their bytes", () => {
    expect(validateIconUpload(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toEqual({ contentType: "image/png" });
    expect(validateIconUpload(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ contentType: "image/jpeg" });
    expect(validateIconUpload(encode("GIF89a…"))).toEqual({ contentType: "image/gif" });
    expect(validateIconUpload(encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toEqual({ contentType: "image/webp" });
  });

  it("accepts a plain SVG, with or without an XML prologue", () => {
    expect(validateIconUpload(encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4" fill="red"/></svg>'))).toEqual({ contentType: "image/svg+xml" });
    expect(validateIconUpload(encode('<?xml version="1.0"?>\n<!-- logo --><svg viewBox="0 0 1 1"><use href="#a"/></svg>'))).toEqual({ contentType: "image/svg+xml" });
  });

  it.each([
    ['<svg><script>alert(1)</script></svg>', "script"],
    ['<svg onload="alert(1)"></svg>', "event handler"],
    ['<svg><a href="javascript:alert(1)"><text>x</text></a></svg>', "javascript URL"],
    ['<svg><foreignObject><div/></foreignObject></svg>', "foreignObject"],
    ['<svg><image href="https://tracker.example/x.png"/></svg>', "external image"],
    ['<svg><style>@import url(https://evil.example/a.css);</style></svg>', "import"],
    ['<!DOCTYPE svg [<!ENTITY x "y">]><svg></svg>', "entity"],
  ])("rejects an SVG with %s (%s)", (svgText) => {
    expect(validateIconUpload(encode(svgText))).toHaveProperty("errorMessage");
  });

  it("rejects other files, empty files and oversized files", () => {
    expect(validateIconUpload(encode("<html><body>hi</body></html>"))).toHaveProperty("errorMessage");
    expect(validateIconUpload(new Uint8Array())).toHaveProperty("errorMessage");
    expect(validateIconUpload(new Uint8Array(MAXIMUM_ICON_BYTES + 1).fill(0x89))).toHaveProperty("errorMessage");
  });
});
