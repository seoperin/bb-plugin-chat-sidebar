// @vitest-environment jsdom
// Its own file: the provider remembers colours for the page.
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

import app from "../app";
import { avatarBackground, colorById } from "../lib/colors";
import { project, thread } from "./fixtures";

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  } as unknown as typeof IntersectionObserver;
});

const stored = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => void stored.set(key, value),
});

beforeEach(() => stored.clear());
afterEach(cleanup);

const threads = [
  thread("thr_root", { title: "Orchestrator" }),
  thread("thr_child", { title: "Builder", parentThreadId: "thr_root" }),
  thread("thr_grand", { title: "Fixer", parentThreadId: "thr_child" }),
  thread("thr_other", { title: "Standalone" }),
];
const projects = [project("proj_a", "Alpha")];

async function render(colors: Record<string, string>) {
  const registration = (await loadPluginApp(app)).threadLists[0];
  if (registration === undefined) throw new Error("thread list is not registered");
  return renderSlot(
    registration,
    { activeThreadId: null, activeProjectId: null, isCompactViewport: false, onNavigate: () => {}, searchQuery: "" },
    {
      sidebarThreads: { status: "ready", threads, projects, sections: [] },
      settings: { foldChildren: false },
      rpc: {
        folders_get: () => ({ layout: null, revision: 0 }),
        colors_get: () => ({ proj_a: "green" }),
        thread_colors_get: () => colors,
      } as never,
    },
  );
}

function row(container: HTMLElement, id: string): HTMLElement {
  const anchor = container.querySelector<HTMLElement>(`a[data-sidebar-thread-id="${id}"]`);
  if (anchor === null) throw new Error(`row ${id} missing`);
  return anchor;
}

function avatarOf(container: HTMLElement, id: string): string {
  const avatar = row(container, id).querySelector<HTMLElement>('[aria-hidden="true"]');
  if (avatar === null) throw new Error(`avatar of ${id} missing`);
  return avatar.style.background;
}

function rendered(background: string): string {
  const probe = document.createElement("span");
  probe.style.background = background;
  return probe.style.background;
}

describe("thread colours", () => {
  it("colours the whole branch from its root and leaves other threads on the project colour", async () => {
    const view = await render({ thr_root: "red", thr_child: "blue" });
    const red = rendered(avatarBackground(colorById("red")));
    const green = rendered(avatarBackground(colorById("green")));
    await waitFor(() => expect(avatarOf(view.container, "thr_root")).toBe(red));
    expect(avatarOf(view.container, "thr_child")).toBe(red);
    expect(avatarOf(view.container, "thr_grand")).toBe(red);
    await waitFor(() => expect(avatarOf(view.container, "thr_other")).toBe(green));
  });

  it("offers the thread colour on a thread that heads its own branch", async () => {
    const view = await render({});
    await waitFor(() => expect(row(view.container, "thr_root")).toBeTruthy());
    fireEvent.contextMenu(row(view.container, "thr_root"));
    expect(await screen.findByRole("menuitem", { name: /Thread colour/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Project colour/ })).toBeTruthy();
  });

  it("does not offer it on a sub-thread", async () => {
    const view = await render({});
    await waitFor(() => expect(row(view.container, "thr_child")).toBeTruthy());
    fireEvent.contextMenu(row(view.container, "thr_child"));
    expect(await screen.findByRole("menuitem", { name: /Project colour/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Thread colour/ })).toBeNull();
  });
});
