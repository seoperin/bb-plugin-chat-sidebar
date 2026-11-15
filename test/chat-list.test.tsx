// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot, type TestThreadActionsResolver } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

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
  options: { threads?: PluginSidebarThread[]; search?: (query: string, signal?: AbortSignal) => Promise<unknown>; list?: (offset: number) => Promise<unknown> } = {},
) {
  const loaded = await loadPluginApp(app);
  const registration = loaded.threadLists[0];
  if (registration === undefined) throw new Error("thread list is not registered");
  const onNavigate = vi.fn();
  const view = renderSlot(
    registration,
    { activeThreadId: null, activeProjectId: null, isCompactViewport: false, onNavigate, searchQuery: "" },
    {
      sidebarThreads: { status: "ready", threads: options.threads ?? threads, projects, sections: [] },
      settings,
      threadActions,
      sdk: {
        threads: {
          list: async ({ offset }: { offset: number }) => options.list ? options.list(offset) : [],
          // Only "deploy logs" is in a message (of the sub-agent folded into thr_wait).
          search: async ({ query, signal }: { query: string; signal?: AbortSignal }) => options.search ? options.search(query, signal) : ({
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
            archived: {
              results:
                query === "old notes"
                  ? [
                      {
                        thread: {
                          id: "thr_gone",
                          title: "Retired spike",
                          titleFallback: null,
                          projectId: "proj_a",
                          providerId: "codex",
                          environmentBranchName: "spike",
                          updatedAt: NOW - 86_400_000,
                        },
                        matches: [{ sourceKind: "user_message", text: "see the old notes", highlightRanges: [{ start: 8, end: 17 }], sourceSeq: 2 }],
                      },
                    ]
                  : [],
              total: 0,
            },
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

  it("searches outside the selected project, shows the project, and restores the folder on clear", async () => {
    const { view } = await render({ language: "English" });
    const rowIds = () => [...view.container.querySelectorAll("li[data-chat-row]")].map((el) => el.getAttribute("data-chat-row"));
    fireEvent.click(screen.getByRole("button", { name: /^Alpha/ }));
    expect(rowIds()).toEqual(["thr_wait"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "idea" } });
    expect(rowIds()).toEqual(["thr_calm"]);
    expect(view.container.querySelector('li[data-chat-row="thr_calm"]')?.textContent).toContain("Beta");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(rowIds()).toEqual(["thr_wait"]);
  });

  it("uses the current folder only to break relevance ties", async () => {
    const { view } = await render({ language: "English" }, undefined, {
      threads: [
        thread("outside_exact", { title: "Widget", projectId: "proj_b", updatedAt: NOW }),
        thread("inside_prefix", { title: "Widget notes", updatedAt: NOW - 1_000 }),
        thread("inside_exact", { title: "Widget", updatedAt: NOW - 10_000 }),
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /^Alpha/ }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Widget" } });
    expect([...view.container.querySelectorAll("li[data-chat-row]")].map((el) => el.getAttribute("data-chat-row"))).toEqual([
      "inside_exact", "outside_exact", "inside_prefix",
    ]);
  });

  it("finds message matches from other folders", async () => {
    const { view } = await render({ language: "English" }, undefined, {
      search: async () => ({ active: { total: 1, results: [{ thread: { id: "thr_calm" }, matches: [{ sourceKind: "user_message", text: "remote phrase", highlightRanges: [], sourceSeq: 1 }] }] }, archived: { total: 0, results: [] } }),
    });
    fireEvent.click(screen.getByRole("button", { name: /^Alpha/ }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "remote phrase" } });
    await screen.findByText("remote phrase");
    expect(view.container.querySelector('li[data-chat-row="thr_calm"]')?.textContent).toContain("Beta");
  });

  it("searches active chats from the archive folder and returns to the archive on clear", async () => {
    const { view } = await render({ language: "English" });
    fireEvent.click(screen.getByRole("button", { name: /^Archive/ }));
    expect(view.container.querySelectorAll("li[data-chat-row]")).toHaveLength(0);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "deploy" } });
    expect(view.container.querySelector('li[data-chat-row="thr_wait"]')).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(view.container.querySelectorAll("li[data-chat-row]")).toHaveLength(0);
  });

  it("finds a chat by its messages and shows the match", async () => {
    const { view } = await render({ language: "English" });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "deploy logs" } });
    const mark = await screen.findByText("deploy logs", { selector: "mark" });
    expect(mark.closest("li")?.getAttribute("data-chat-row")).toBe("thr_wait");
    expect(view.container.querySelectorAll("a[data-sidebar-thread-id]")).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter" });
    expect(view.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "thr_child", options: { split: false } }]);
  });

  it("ranks an exact title before a child title and pinned message-only hits", async () => {
    const { view } = await render({ language: "English" }, undefined, {
      threads: [
        thread("noise", { title: "Notes", isPinned: true, pinnedAt: NOW }),
        thread("exact", { title: "Widget", updatedAt: NOW - 10_000 }),
        thread("parent", { title: "Investigation" }),
        thread("child", { title: "Widget retry", parentThreadId: "parent" }),
      ],
      search: async () => ({ active: { total: 1, results: [{ thread: { id: "noise", title: "Notes" }, matches: [{ sourceKind: "user_message", text: "Widget in notes", highlightRanges: [], sourceSeq: 1 }] }] }, archived: { total: 0, results: [] } }),
    });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "WIDGET" } });
    await screen.findByText("Widget in notes");
    expect([...view.container.querySelectorAll("li[data-chat-row]")].map((el) => el.getAttribute("data-chat-row"))).toEqual(["exact", "parent", "noise"]);
  });

  it("finds words in a different order and opens the matched child title", async () => {
    const { view } = await render({ language: "English" });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "task sub" } });
    const row = view.container.querySelector<HTMLAnchorElement>('a[data-sidebar-thread-id="thr_wait"]')!;
    expect(row.href).toContain("thr_child");
    fireEvent.click(row, { button: 0 });
    expect(view.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "thr_child", options: { split: false } }]);
  });

  it("shows a message-search failure without claiming there are no matches", async () => {
    await render({ language: "English" }, undefined, { search: async () => { throw new Error("offline"); } });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing text" } });
    expect(await screen.findByText("Some search results are unavailable. Loaded chat titles are still searched.")).toBeTruthy();
    expect(screen.queryByText("Nothing matches “missing text”")).toBeNull();
  });

  it("keeps the newest results when an aborted request still resolves", async () => {
    let resolveOld: (value: unknown) => void = () => { throw new Error("old query not sent"); };
    const search = vi.fn(async (query: string) => query === "old request" ? new Promise((resolve) => { resolveOld = resolve; }) : ({ active: { total: 1, results: [{ thread: { id: "thr_wait", title: "Deploy fix" }, matches: [{ sourceKind: "user_message", text: "fresh result", highlightRanges: [], sourceSeq: 1 }] }] }, archived: { total: 0, results: [] } }));
    await render({ language: "English" }, undefined, { search });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "old request" } });
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "fresh" } });
    await screen.findByText("fresh result");
    resolveOld({ active: { total: 0, results: [] }, archived: { total: 0, results: [] } });
    await waitFor(() => expect(screen.getByText("fresh result")).toBeTruthy());
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

  it("lists archived chats the search finds under the results", async () => {
    const { view } = await render({ language: "English" });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "old notes" } });
    expect(await screen.findByText("In the archive · 1")).toBeTruthy();
    expect(screen.getByText("Found only in the archive")).toBeTruthy();
    const link = screen.getByText("Retired spike").closest("a");
    expect(link?.getAttribute("href")).toBe("/projects/proj_a/threads/thr_gone");
    fireEvent.click(link!, { button: 0 });
    expect(view.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "thr_gone", options: { split: false } }]);
  });

  it("opens an archive-only result with Enter", async () => {
    const { view } = await render({ language: "English" });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "old notes" } });
    await screen.findByText("Retired spike");
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter" });
    expect(view.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "thr_gone", options: { split: false } }]);
  });

  it("searches every page of archive titles with the same rules and reuses them while typing", async () => {
    const list = vi.fn(async (offset: number) => offset === 0
      ? Array.from({ length: 100 }, (_, i) => ({ ...thread(`arch_${i}`, { title: "Other archived chat" }), environmentBranchName: null }))
      : [{ ...thread("arch_target", { title: "TASK-1042 [Example] Prepare DTOs" }), environmentBranchName: null }]);
    const { view } = await render({ language: "English" }, undefined, { list });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "TASK1042" } });
    await screen.findByText("TASK-1042 [Example] Prepare DTOs");
    expect(list.mock.calls.map(([offset]) => offset)).toEqual([0, 100]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "1042 example" } });
    expect(screen.getByText("TASK-1042 [Example] Prepare DTOs")).toBeTruthy();
    expect(list).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter" });
    expect(view.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "arch_target", options: { split: false } }]);
  });

  it("makes truncated message results explicit", async () => {
    await render({ language: "English" }, undefined, { search: async () => ({
      active: { total: 51, results: [] }, archived: { total: 0, results: [] },
    }) });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "many messages" } });
    expect(await screen.findByText("Message search returned only the first 50 matches per group. Refine your search.")).toBeTruthy();
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

  it("shows folders as tabs on a phone even when the rail is picked", async () => {
    const loaded = await loadPluginApp(app);
    const strip = (isCompactViewport: boolean, phoneFolderLayout?: string) => {
      const view = renderSlot(
        loaded.threadLists[0]!,
        { activeThreadId: null, activeProjectId: null, isCompactViewport, onNavigate: vi.fn(), searchQuery: "" },
        {
          sidebarThreads: { status: "ready", threads, projects, sections: [] },
          settings: { folderLayout: "Rail on the left", ...(phoneFolderLayout ? { phoneFolderLayout } : {}) },
        },
      );
      const tabs = view.container.querySelector(".chat-tab-strip") !== null;
      view.unmount();
      return tabs;
    };
    expect(strip(false)).toBe(false);
    expect(strip(true)).toBe(true);
    expect(strip(true, "Same as on wider screens")).toBe(false);
  });

  it("speaks the language picked in settings", async () => {
    await render({ language: "Русский" });
    expect(screen.getByRole("searchbox").getAttribute("placeholder")).toBe("Поиск по чатам");
    expect(screen.getByRole("button", { name: /^Внимание/ })).toBeTruthy();
  });
});
