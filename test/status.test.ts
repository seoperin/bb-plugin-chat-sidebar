import { describe, expect, it } from "vitest";

import { laneOf, statusMessage } from "../lib/status";
import { thread } from "./fixtures";

describe("laneOf", () => {
  it("reads attention, working, done, and quiet", () => {
    expect(laneOf(thread("t", { hasPendingInteraction: true, status: "active" }))).toBe("attention");
    expect(laneOf(thread("t", { queuedWork: "failed" }))).toBe("attention");
    expect(laneOf(thread("t", { status: "active" }))).toBe("working");
    expect(laneOf(thread("t", { indicator: "unread-success" }))).toBe("done");
    expect(laneOf(thread("t"))).toBeNull();
  });

  it.each(["workflows", "backgroundAgents", "backgroundCommands", "planMode"] as const)(
    "reads %s activity without a runtime or indicator",
    (kind) => {
      const activity = { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, [kind]: 1 };
      expect(laneOf(thread("t", { activity }))).toBe("working");
    },
  );

  it("treats an unknown indicator as quiet", () => {
    expect(laneOf(thread("t", { indicator: "something-new" as never }))).toBeNull();
  });
});

describe("statusMessage", () => {
  it("names the reason a thread waits or works", () => {
    expect(statusMessage(thread("t", { queuedWork: "failed" }), "attention")).toEqual(["status.sendFailed"]);
    expect(statusMessage(thread("t", { indicator: "unread-error" }), "attention")).toEqual(["status.error"]);
    expect(statusMessage(thread("t", { runtimeStatus: "provisioning" }), "working")).toEqual(["status.provisioning"]);
    expect(
      statusMessage(
        thread("t", { activity: { workflows: 0, backgroundAgents: 3, backgroundCommands: 0, planMode: 0 } }),
        "working",
      ),
    ).toEqual(["status.backgroundAgents", { count: 3 }]);
    expect(
      statusMessage(thread("t", { activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 1 } }), "working"),
    ).toEqual(["status.planning"]);
  });
});
