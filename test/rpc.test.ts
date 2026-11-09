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

describe("machine fields in the folder layout contract", () => {
  const parse = (layout: unknown) => rpcContract.folders_set.input.safeParse({ baseRevision: 0, layout });

  it("accepts a layout saved before machines existed", () => {
    const { hosts: _hosts, excludeHosts: _excludeHosts, ...oldRule } = emptyRule();
    expect(parse({ version: 1, entries: [{ ...customEntry("Old", "Folder"), rule: oldRule }] }).success).toBe(true);
  });

  it("accepts machine filters, the Machines entry and a machine order", () => {
    const layout = {
      version: 1,
      entries: [
        { id: "machines", kind: "machines", name: null, icon: null, color: null, hidden: false, rule: null },
        { ...customEntry("Pod", "Folder"), rule: { ...emptyRule(), hosts: ["host_pod"], excludeHosts: ["host_mac"] } },
      ],
      hostOrder: ["host_pod", "host_mac"],
    };
    expect(parse(layout).success).toBe(true);
  });
});
