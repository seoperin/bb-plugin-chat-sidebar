import { describe, expect, it } from "vitest";

import { laneOf, statusMessage } from "../lib/status";
import { thread } from "./fixtures";

describe("laneOf", () => {
  it("reads attention, working, done, and quiet", () => {
    expect(laneOf(thread("t", { hasPendingInteraction: true, status: "active" }))).toBe("attention");
    expect(laneOf(thread("t", { queuedWork: "failed" }))).toBe("attention");
    expect(laneOf(thread("t", { status: "active" }))).toBe("working");
    expect(laneOf(thread("t", { activity: { workflows: 1, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 } }))).toBe("working");
    expect(laneOf(thread("t", { indicator: "unread-success" }))).toBe("done");
    expect(laneOf(thread("t"))).toBeNull();
  });

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
        thread("t", { activity: { workflows: 0, backgroundAgents: 3, backgroundCommands: 0, planMode: 0, goals: 0 } }),
        "working",
      ),
    ).toEqual(["status.backgroundAgents", { count: 3 }]);
  });
});
