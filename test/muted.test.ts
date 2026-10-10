import { describe, expect, it } from "vitest";

import { effectiveLevels, parseDefaults, parseOwnLevel, type NotificationLevel } from "../lib/muted";

const threads = [
  { id: "root", parentThreadId: null },
  { id: "child", parentThreadId: "root" },
  { id: "grandchild", parentThreadId: "child" },
  { id: "other", parentThreadId: null },
];

describe("muted chats", () => {
  it("reads the notifications plugin's metadata and settings", () => {
    expect(parseOwnLevel({ notifications: { own: "muted" } })).toBe("muted");
    expect(parseOwnLevel({ notifications: { own: "inherit" } })).toBeNull();
    expect(parseOwnLevel({})).toBeNull();
    expect(parseDefaults({ defaultLevel: "muted", childLevel: "inherit" })).toEqual({
      defaultLevel: "muted",
      childLevel: "inherit",
    });
    expect(parseDefaults(null)).toEqual({ defaultLevel: "all", childLevel: "input-only" });
  });

  it("resolves own level, child default, default, and an ancestor's cap", () => {
    const own = new Map<string, NotificationLevel>([["root", "muted"], ["other", "input-only"]]);
    const levels = effectiveLevels(threads, own, { defaultLevel: "all", childLevel: "all" });
    expect(Object.fromEntries(levels)).toEqual({
      root: "muted",
      child: "muted",
      grandchild: "muted",
      other: "input-only",
    });
  });

  it("lets a louder own level stay capped by a quieter parent, never the reverse", () => {
    const own = new Map<string, NotificationLevel>([["root", "input-only"], ["child", "all"]]);
    const levels = effectiveLevels(threads, own, { defaultLevel: "muted", childLevel: "inherit" });
    expect(levels.get("child")).toBe("input-only");
    expect(levels.get("grandchild")).toBe("muted");
    expect(levels.get("other")).toBe("muted");
  });
});
