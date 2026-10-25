import { describe, expect, it } from "vitest";
import { readSafeNextPath } from "@/lib/authentication/safe-next-path";

describe("readSafeNextPath", () => {
  it("keeps same-origin paths", () => {
    expect(readSafeNextPath("/watcher?range=7d")).toBe("/watcher?range=7d");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/\tevil", "evil", undefined, ["/a"]])("rejects %s", (nextPath) => {
    expect(readSafeNextPath(nextPath)).toBe("/");
  });
});
