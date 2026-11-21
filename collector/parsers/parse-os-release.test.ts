import { describe, expect, test } from "vitest";
import { parseOsReleaseName } from "./parse-os-release";

describe("parseOsReleaseName", () => {
  test("prefers PRETTY_NAME", () => {
    expect(parseOsReleaseName('PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.1 LTS (Noble Numbat)"\nID=ubuntu\n')).toBe("Ubuntu 24.04.1 LTS");
  });

  test("falls back to NAME and VERSION", () => {
    expect(parseOsReleaseName("NAME='Ubuntu'\nVERSION='22.04.4 LTS (Jammy Jellyfish)'\n")).toBe("Ubuntu 22.04.4 LTS (Jammy Jellyfish)");
    expect(parseOsReleaseName("NAME=Debian\n")).toBe("Debian");
  });

  test("returns null when empty", () => {
    expect(parseOsReleaseName("")).toBeNull();
  });
});
