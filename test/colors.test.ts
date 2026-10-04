import { describe, expect, it } from "vitest";

import { PALETTE, assignProjectColors, colorForKey, isColorId } from "../lib/colors";

describe("assignProjectColors", () => {
  const ids = Array.from({ length: 12 }, (_, index) => `proj_${index.toString(36)}x`);

  it("gives up to twelve projects twelve different colours", () => {
    const assigned = assignProjectColors(ids, {});
    expect(new Set([...assigned.values()].map((color) => color.id)).size).toBe(12);
  });

  it("keeps the user's pick and moves automatic colours out of its way", () => {
    const auto = assignProjectColors(ids, {});
    const first = ids[0] as string;
    const second = ids[1] as string;
    const stolen = auto.get(second)?.id;
    expect(stolen).toBeDefined();
    if (stolen === undefined) return;
    const assigned = assignProjectColors(ids, { [first]: stolen });
    expect(assigned.get(first)?.id).toBe(stolen);
    const others = ids.slice(1).map((id) => assigned.get(id)?.id);
    expect(others).not.toContain(stolen);
  });

  it("is deterministic and independent of input order", () => {
    const forward = assignProjectColors(ids, {});
    const backward = assignProjectColors([...ids].reverse(), {});
    for (const id of ids) expect(backward.get(id)?.id).toBe(forward.get(id)?.id);
  });

  it("uses only the clearest colours while there are few projects", () => {
    const few = assignProjectColors(["a", "b", "c", "d"], {});
    const clear = ["blue", "red", "green", "orange", "violet", "teal"];
    for (const color of few.values()) expect(clear).toContain(color.id);
  });

  it("wraps around once every colour is taken", () => {
    const many = Array.from({ length: 20 }, (_, index) => `p${index}`);
    expect(assignProjectColors(many, {}).size).toBe(20);
  });

  it("ignores picks that are not palette colours", () => {
    const assigned = assignProjectColors(["a"], { a: "plaid" as never });
    expect(PALETTE.map((color) => color.id)).toContain(assigned.get("a")?.id);
  });
});

describe("palette helpers", () => {
  it("recognises palette ids and colours keys stably", () => {
    expect(isColorId("blue")).toBe(true);
    expect(isColorId("plaid")).toBe(false);
    expect(colorForKey("thr_1")).toBe(colorForKey("thr_1"));
  });
});

describe("palette additions", () => {
  const OLD_ORDER = [
    "red",
    "orange",
    "amber",
    "lime",
    "green",
    "teal",
    "cyan",
    "blue",
    "indigo",
    "violet",
    "magenta",
    "pink",
  ];

  it("keeps every chat without a project on the colour it had", () => {
    const old = (key: string) => {
      let value = 0;
      for (const char of key) value = (value * 31 + char.charCodeAt(0)) >>> 0;
      return OLD_ORDER[value % OLD_ORDER.length];
    };
    for (const key of ["thr_abc", "thr_x1y2z3", "proj_personal", "", "долгий ключ"]) {
      expect(colorForKey(key).id).toBe(old(key));
    }
  });

  it("never hands out the added colours automatically", () => {
    const ids = Array.from({ length: 40 }, (_, index) => `proj_${index}`);
    const used = new Set([...assignProjectColors(ids, {}).values()].map((color) => color.id));
    for (const added of ["yellow", "brown", "slate"]) expect(used.has(added as never)).toBe(false);
  });
});
