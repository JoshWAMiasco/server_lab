import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ServerLabDatabase } from "@/lib/database/client";
import { customIconExists, listCustomIcons, pruneUnusedCustomIcons, readCustomIcon, storeCustomIcon } from "@/lib/lobby/custom-icon-store";
import { readCustomIconId, resolveIconUrl } from "@/lib/lobby/icon-reference";
import { lobbyItems } from "@/lib/schema/lobby";
import { createTemporaryDatabase } from "@/lib/testing/temporary-database";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe("custom icons", () => {
  let database: ServerLabDatabase;
  let remove: () => void;
  beforeEach(() => ({ database, remove } = createTemporaryDatabase()));
  afterEach(() => remove());

  it("stores an upload once per content and serves it back", () => {
    const first = storeCustomIcon(database, PNG_BYTES, "logo.png");
    const second = storeCustomIcon(database, PNG_BYTES, "copy.png");
    expect(first).toEqual(second);
    if (!("iconReference" in first)) throw new Error(first.errorMessage);
    expect(customIconExists(database, first.iconReference)).toBe(true);
    expect(listCustomIcons(database)).toEqual([{ iconReference: first.iconReference, name: "logo.png" }]);
    expect(readCustomIcon(database, readCustomIconId(first.iconReference) ?? "")?.contentType).toBe("image/png");
  });

  it("rejects invalid uploads without storing them", () => {
    expect(storeCustomIcon(database, new TextEncoder().encode('<svg onload="x()"></svg>'), "bad.svg")).toHaveProperty("errorMessage");
    expect(listCustomIcons(database)).toEqual([]);
  });

  it("prunes old uploads that no item uses, keeping used and fresh ones", () => {
    const used = storeCustomIcon(database, PNG_BYTES, "used.png");
    const unused = storeCustomIcon(database, new Uint8Array([0xff, 0xd8, 0xff, 9]), "unused.jpg");
    if (!("iconReference" in used) || !("iconReference" in unused)) throw new Error("upload failed");
    database.insert(lobbyItems).values({ key: "docker:app", icon: used.iconReference, createdAt: 0, updatedAt: 0 }).run();
    expect(pruneUnusedCustomIcons(database, Date.now())).toBe(0);
    expect(pruneUnusedCustomIcons(database, Date.now() + 2 * 24 * 60 * 60 * 1000)).toBe(1);
    expect(customIconExists(database, used.iconReference)).toBe(true);
    expect(customIconExists(database, unused.iconReference)).toBe(false);
  });

  it("resolves icon references to URLs and rejects malformed ones", () => {
    const hash = "a".repeat(64);
    expect(resolveIconUrl(`custom:${hash}`)).toBe(`/custom-icons/${hash}`);
    expect(resolveIconUrl("jellyfin.svg")).toBe("/catalog-icons/jellyfin.svg");
    expect(resolveIconUrl("../../etc/passwd")).toBeNull();
    expect(resolveIconUrl("custom:../x")).toBeNull();
    expect(resolveIconUrl(null)).toBeNull();
  });
});
