import { describe, expect, test } from "vitest";
import { pickClientAddress } from "@/lib/authentication/request-context";

describe("pickClientAddress", () => {
  test("prefers X-Real-IP, then the first X-Forwarded-For hop", () => {
    expect(pickClientAddress(" 100.64.0.7 ", "203.0.113.9")).toBe("100.64.0.7");
    expect(pickClientAddress(null, "203.0.113.9, 100.64.0.1")).toBe("203.0.113.9");
    expect(pickClientAddress(null, "fd7a:115c:a1e0::7")).toBe("fd7a:115c:a1e0::7");
  });

  test("ignores values that are not IP addresses", () => {
    expect(pickClientAddress("<script>alert(1)</script>", null)).toBeNull();
    expect(pickClientAddress("unknown", "203.0.113.9")).toBe("203.0.113.9");
    expect(pickClientAddress(`1.2.3.4${"x".repeat(5000)}`, null)).toBeNull();
    expect(pickClientAddress(null, "")).toBeNull();
    expect(pickClientAddress(null, null)).toBeNull();
  });
});
