// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

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

async function render(settings: Record<string, string | number | boolean> = {}) {
  const loaded = await loadPluginApp(app);
  const registration = loaded.threadLists[0];
  if (registration === undefined) throw new Error("thread list is not registered");
  const onNavigate = vi.fn();
  const view = renderSlot(
    registration,
    { activeThreadId: null, activeProjectId: null, isCompactViewport: false, onNavigate, searchQuery: "" },
    { sidebarThreads: { status: "ready", threads, projects, sections: [] }, settings },
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

  it("opens through bb's actions and closes the mobile drawer", async () => {
    const { view, onNavigate } = await render();
    const anchor = view.container.querySelector<HTMLAnchorElement>('a[data-sidebar-thread-id="thr_calm"]');
    if (anchor === null) throw new Error("row missing");
    fireEvent.click(anchor, { button: 0 });
    fireEvent.click(anchor, { button: 0, metaKey: true });
    expect(view.inspection.sidebarActionCalls).toEqual([
      { method: "open", threadId: "thr_calm", options: { split: false } },
      { method: "open", threadId: "thr_calm", options: { split: true } },
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
    expect(screen.getByText("Nothing matches “zzz”")).toBeTruthy();
  });

  it("speaks the language picked in settings", async () => {
    await render({ language: "Русский" });
    expect(screen.getByRole("searchbox").getAttribute("placeholder")).toBe("Поиск по чатам");
    expect(screen.getByRole("button", { name: /^Внимание/ })).toBeTruthy();
  });
});
