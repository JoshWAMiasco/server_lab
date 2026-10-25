import fileSystem from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("docker client", () => {
  const source = fileSystem.readFileSync(path.join(import.meta.dirname, "docker-client.ts"), "utf8");

  it("only ever sends GET requests", () => {
    const methods = [...source.matchAll(/method:\s*"([A-Z]+)"/g)].map((match) => match[1]);
    expect(methods).toEqual(["GET"]);
    expect(source).not.toMatch(/"(POST|PUT|DELETE|PATCH)"/);
  });

  it("exposes no mutating endpoints", () => {
    expect(source).not.toMatch(/\/(start|stop|restart|kill|exec|create|remove|pause|unpause|update|rename|prune)\b/);
  });
});
