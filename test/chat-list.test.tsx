// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot, type TestThreadActionsResolver } from "@get-bb/plugin-sdk/testing/app";

import app from "../app";
import { NOW, project, thread } from "./fixtures";

beforeAll(() => {
  // jsdom has no IntersectionObserver; paging is not under test here.
  globalThis.IntersectionObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  } as unknown as typeof IntersectionObserver;
});

afterEach(cleanup);

const threads = [
  thread("thr_wait", { title: "Deploy fix", hasPendingInteraction: true, updatedAt: NOW }),
  thread("thr_calm", { title: "Old idea", projectId: "proj_b", updatedAt: NOW - 50_000 }),
  thread("thr_child", { title: "Sub task", parentThreadId: "thr_wait" }),
];
const projects = [project("proj_a", "Alpha"), project("proj_b", "Beta")];

async function render(
  settings: Record<string, string | number | boolean> = {},
  threadActions?: TestThreadActionsResolver,
) {
  const loaded = await loadPluginApp(app);
  const registration = loaded.threadLists[0];
  if (registration === undefined) throw new Error("thread list is not registered");
  const onNavigate = vi.fn();
  const view = renderSlot(
    registration,
    { activeThreadId: null, activeProjectId: null, isCompactViewport: false, onNavigate, searchQuery: "" },
    {
      sidebarThreads: { status: "ready", threads, projects, sections: [] },
      settings,
      threadActions,
      sdk: {
        threads: {
          // Only "deploy logs" is in a message (of the sub-agent folded into thr_wait).
          search: async ({ query }: { query: string }) => ({
            active: {
              results:
                query === "deploy logs"
                  ? [
                      {
                        thread: { id: "thr_child" },
                        matches: [
                          { sourceKind: "assistant_message", text: "…read the deploy logs first", highlightRanges: [{ start: 10, end: 21 }], sourceSeq: 1 },
                        ],
                      },
                    ]
                  : [],
              total: 0,
            },
            archived: { results: [], total: 0 },
          }),
        } as never,
      },
      rpc: { colors_get: () => ({ proj_b: "pink" }), colors_set: (input) => {
          const { projectId, color } = input as { projectId: string; color: string | null };
          return color === null ? {} : { [projectId]: color };
        },
      },
    },
  );
  return { view, onNavigate };
}

describe("chat list", () => {
  it("renders one row per root with bb's shortcut contract", async () => {
    const { view } = await render({ language: "English" });
    const anchors = view.container.querySelectorAll("a[data-sidebar-thread-shortcut-target]");
    expect([...anchors].map((anchor) => anchor.getAttribute("data-sidebar-thread-id"))).toEqual([
      "thr_wait",
      "thr_calm",
    ]);
    expect(anchors[0]?.getAttribute("href")).toBe("/projects/proj_a/threads/thr_wait");
    expect(screen.getByText("Needs you")).toBeTruthy();
  });

  it("opens through bb's navigation and closes the mobile drawer", async () => {
    const { view, onNavigate } = await render();
    const anchor = view.container.querySelector<HTMLAnchorElement>('a[data-sidebar-thread-id="thr_calm"]');
    if (anchor === null) throw new Error("row missing");
    fireEvent.click(anchor, { button: 0 });
    fireEvent.click(anchor, { button: 0, metaKey: true });
    expect(view.inspection.navigateCalls).toEqual([
      { method: "toThread", threadId: "thr_calm", options: { split: false } },
      { method: "toThread", threadId: "thr_calm", options: { split: true } },
    ]);
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("filters by folder and by search", async () => {
    const { view } = await render({ language: "English" });
    const rowIds = () =>
      [...view.container.querySelectorAll("a[data-sidebar-thread-id]")].map((anchor) =>
        anchor.getAttribute("data-sidebar-thread-id"),
      );
    fireEvent.click(screen.getByRole("button", { name: /^Attention/ }));
    expect(rowIds()).toEqual(["thr_wait"]);
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "sub task" } });
    expect(rowIds()).toEqual(["thr_wait"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(await screen.findByText("Nothing matches “zzz”")).toBeTruthy();
  });

  it("finds a chat by its messages and shows the match", async () => {
    const { view } = await render({ language: "English" });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "deploy logs" } });
    const mark = await screen.findByText("deploy logs", { selector: "mark" });
    expect(mark.closest("li")?.getAttribute("data-chat-row")).toBe("thr_wait");
    expect(view.container.querySelectorAll("a[data-sidebar-thread-id]")).toHaveLength(1);
  });

  it("starts a new chat in the open project's folder", async () => {
    const { view, onNavigate } = await render({ language: "English" });
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    fireEvent.click(screen.getByRole("button", { name: /^Beta/ }));
    fireEvent.click(screen.getByRole("button", { name: "New chat in Beta" }));
    expect(view.inspection.navigateCalls.filter((call) => call.method === "toCompose")).toEqual([
      { method: "toCompose", options: { focusPrompt: true } },
      { method: "toCompose", options: { projectId: "proj_b", focusPrompt: true } },
    ]);
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("marks a chat whose notifications are muted in bb", async () => {
    await render({ language: "English" }, (thread) =>
      thread.id === "thr_calm"
        ? [
            {
              key: "push-notifications/notifications",
              pluginId: "push-notifications",
              group: "3_settings",
              action: { label: "Notifications", detail: "Muted", icon: "push-notifications/off", run: async () => {} },
            },
          ]
        : [],
    );
    const muted = screen.getAllByLabelText("Notifications off");
    expect(muted).toHaveLength(1);
    expect(muted[0]?.closest("li")?.getAttribute("data-chat-row")).toBe("thr_calm");
  });

  it("adds Add to folder to bb's thread menus only while the list is up", async () => {
    const loaded = await loadPluginApp(app);
    const registration = loaded.threadActions.find((action) => action.id === "add-to-folder");
    expect(registration?.group).toBe("2_organize");
  });

  it("speaks the language picked in settings", async () => {
    await render({ language: "Русский" });
    expect(screen.getByRole("searchbox").getAttribute("placeholder")).toBe("Поиск по чатам");
    expect(screen.getByRole("button", { name: /^Внимание/ })).toBeTruthy();
  });
});
