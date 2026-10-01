import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseStringArray, readStored, writeStored } from "../lib/storage";

beforeEach(() => {
  const items = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("stored conveniences", () => {
  it("round-trips a value and falls back when nothing is stored", () => {
    expect(readStored("k", (raw) => raw, "fallback")).toBe("fallback");
    writeStored("k", "value");
    expect(readStored("k", (raw) => raw, "fallback")).toBe("value");
  });

  it("rejects stored junk instead of crashing", () => {
    for (const junk of ["5", "{}", '["a", 1]', "not json"]) {
      localStorage.setItem("groups", junk);
      expect(readStored("groups", parseStringArray, [])).toEqual([]);
    }
    localStorage.setItem("groups", '["a","b"]');
    expect(readStored("groups", parseStringArray, [])).toEqual(["a", "b"]);
  });

  it("survives storage that throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readStored("k", (raw) => raw, "fallback")).toBe("fallback");
    expect(() => writeStored("k", "v")).not.toThrow();
  });
});
