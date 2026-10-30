import { describe, expect, it, vi } from "vitest";

import { moveToSectionAction, toActionTarget } from "../components/thread-actions";
import { thread } from "./fixtures";

const target = {
  id: "thr_a",
  projectId: "proj_a",
  parentThreadId: null,
  parentNotifications: "auto",
  archivedAt: null,
  pinnedAt: null,
  sectionId: null,
  isUnread: false,
  status: "idle",
  environment: null,
} as const;
const t = ((key: string) => key) as never;
const sections = [{ id: "sec_1", name: "Later", createdAt: 0, updatedAt: 0 }];

describe("Thread action target", () => {
  it("preserves parent notification settings and defaults older bb payloads to auto", () => {
    for (const parentNotifications of ["auto", "stuck", "off"] as const)
      expect(toActionTarget(thread("child", { parentNotifications })).parentNotifications).toBe(parentNotifications);
    const { parentNotifications: _, ...legacy } = thread("child");
    expect(toActionTarget(legacy as ReturnType<typeof thread>).parentNotifications).toBe("auto");
  });
});

function item(data: Parameters<typeof moveToSectionAction.item>[0]["data"], thread: object = target) {
  const update = vi.fn(async () => ({}));
  const action = moveToSectionAction.item({
    thread: thread as never,
    data,
    sdk: { threads: { update } } as never,
    navigate: {} as never,
    experimental_panel: {} as never,
  });
  return { action, update };
}

describe("Move to section", () => {
  it("hides without sections, for sub-agents and for archived chats", () => {
    expect(item(null).action).toBeNull();
    expect(item({ t, sections }, { ...target, parentThreadId: "thr_root" }).action).toBeNull();
    expect(item({ t, sections }, { ...target, archivedAt: 1 }).action).toBeNull();
  });

  it("offers No section and every section, and files the chat", async () => {
    const { action, update } = item({ t, sections });
    expect(action?.choices?.items.map((choice) => [choice.id, choice.selected])).toEqual([
      ["__none__", true],
      ["sec_1", false],
    ]);
    await action?.run({ value: "sec_1", requestRename: () => {} });
    expect(update).toHaveBeenCalledWith({ threadId: "thr_a", sectionId: "sec_1" });
    await action?.run({ value: "__none__", requestRename: () => {} });
    expect(update).toHaveBeenCalledTimes(1);
  });
});
