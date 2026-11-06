import { describe, expect, it } from "vitest";

import { customEntry, emptyRule, MAX_ACTIVITY_HOURS } from "../lib/folders";
import { rpcContract } from "../lib/rpc";

describe("activity period contract", () => {
  const parse = (since: unknown) => rpcContract.folders_set.input.safeParse({
    baseRevision: 0,
    layout: { version: 1, entries: [{ ...customEntry("Recent", "Clock"), rule: { ...emptyRule(), since } }] },
  });

  it.each(["any", "today", "week", 1, 24, 72, MAX_ACTIVITY_HOURS])("accepts %s", (since) => {
    expect(parse(since).success).toBe(true);
  });

  it.each([0, -1, 1.5, MAX_ACTIVITY_HOURS + 1, "24", null])("rejects %s", (since) => {
    expect(parse(since).success).toBe(false);
  });
});
