// What a thread is doing, in the order it matters to a person.
//
// - attention: blocked on the user (a question, an approval, a failed send,
//   an error). Nothing moves until they act.
// - working: a turn, background agents, workflows, goals.
// - done: finished and not looked at yet.
//
// bb adds indicator and status kinds over time; anything unknown reads as
// "quiet" (null) rather than guessing.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

import type { MessageKey, Params } from "./i18n";

export type Lane = "attention" | "working" | "done";

export const LANE_RANK: Record<Lane, number> = { attention: 3, working: 2, done: 1 };

const ATTENTION_INDICATORS = new Set<string>(["waiting-for-input", "queued-failed", "unread-error"]);
const WORKING_INDICATORS = new Set<string>([
  "runtime",
  "workflow",
  "background-agent",
  "background-command",
  "goal",
  "plan-mode",
  "queued-waiting",
  "working-draft",
]);
const BUSY_STATUSES = new Set<string>([
  "starting",
  "active",
  "stopping",
  "provisioning",
  "host-reconnecting",
  "waiting-for-host",
]);

export function laneOf(thread: PluginSidebarThread): Lane | null {
  if (
    thread.hasPendingInteraction ||
    thread.queuedWork === "failed" ||
    ATTENTION_INDICATORS.has(thread.indicator)
  ) {
    return "attention";
  }
  const { activity } = thread;
  if (
    BUSY_STATUSES.has(thread.runtimeStatus) ||
    BUSY_STATUSES.has(thread.status) ||
    WORKING_INDICATORS.has(thread.indicator) ||
    activity.workflows + activity.backgroundAgents + activity.backgroundCommands + activity.goals > 0
  ) {
    return "working";
  }
  if (thread.indicator === "unread-success") return "done";
  return null;
}

/** The detailed status line for a thread in a lane, as a message to translate. */
export function statusMessage(thread: PluginSidebarThread, lane: Lane): [MessageKey, Params?] {
  if (lane === "done") return ["status.doneLong"];
  if (lane === "attention") {
    if (thread.queuedWork === "failed" || thread.indicator === "queued-failed") return ["status.sendFailed"];
    if (thread.indicator === "unread-error" || thread.status === "error") return ["status.error"];
    return ["status.waitingReply"];
  }
  switch (thread.runtimeStatus) {
    case "provisioning":
      return ["status.provisioning"];
    case "host-reconnecting":
      return ["status.hostReconnecting"];
    case "waiting-for-host":
      return ["status.waitingForHost"];
    case "starting":
      return ["status.starting"];
    case "stopping":
      return ["status.stopping"];
  }
  const { activity } = thread;
  if (activity.workflows > 0) return ["status.workflow"];
  if (thread.indicator === "plan-mode") return ["status.planning"];
  if (thread.indicator === "goal" || activity.goals > 0) return ["status.goal"];
  // A running turn outranks background work: while the agent answers, it works.
  if (thread.status === "active") return ["status.working"];
  if (activity.backgroundAgents > 0) {
    return ["status.backgroundAgents", { count: activity.backgroundAgents }];
  }
  if (activity.backgroundCommands > 0) return ["status.backgroundCommand"];
  if (thread.indicator === "queued-waiting") return ["status.queued"];
  return ["status.working"];
}
