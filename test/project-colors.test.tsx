// @vitest-environment jsdom
// Its own file: the provider remembers colours for the page, so it needs a
// fresh module rather than one other list tests have already rendered.
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

import app from "../app";
import { avatarBackground, colorById } from "../lib/colors";
import { project, thread } from "./fixtures";

beforeAll(() => {
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

// Node's own localStorage shadows jsdom's and is unusable without a flag.
const stored = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => void stored.set(key, value),
});

afterEach(cleanup);

const threads = [thread("thr_a", { title: "Alpha chat" })];
const projects = [project("proj_a", "Alpha")];

async function render(rpc: { colors_get: () => unknown }, realtimeConnectionState?: "reconnecting") {
  const registration = (await loadPluginApp(app)).threadLists[0];
  if (registration === undefined) throw new Error("thread list is not registered");
  return renderSlot(
    registration,
    { activeThreadId: null, activeProjectId: null, isCompactViewport: false, onNavigate: () => {}, searchQuery: "" },
    {
      sidebarThreads: { status: "ready", threads, projects, sections: [] },
      rpc: rpc as never,
      ...(realtimeConnectionState !== undefined ? { realtimeConnectionState } : {}),
    },
  );
}

function avatarOf(container: HTMLElement): HTMLElement {
  const avatar = container.querySelector<HTMLElement>('a[data-sidebar-thread-id="thr_a"] [aria-hidden="true"]');
  if (avatar === null) throw new Error("avatar missing");
  return avatar;
}

/** jsdom normalises inline colours, so compare against one it rendered too. */
function rendered(background: string): string {
  const probe = document.createElement("span");
  probe.style.background = background;
  return probe.style.background;
}

describe("project colours", () => {
  it("shows the last colours seen before the backend answers", async () => {
    localStorage.setItem("chat-sidebar/project-colors", JSON.stringify({ proj_a: "red" }));
    const view = await render({ colors_get: () => new Promise(() => {}) });
    expect(avatarOf(view.container).style.background).toBe(rendered(avatarBackground(colorById("red"))));
  });

  it("reloads colours when the realtime connection comes back", async () => {
    let answer: Record<string, string> = { proj_a: "red" };
    const view = await render({ colors_get: () => answer }, "reconnecting");
    await waitFor(() => expect(view.inspection.rpcCalls.filter((call) => call.method === "colors_get")).toHaveLength(1));
    answer = { proj_a: "teal" };
    await view.setRealtimeConnectionState("connected");
    await waitFor(() =>
      expect(avatarOf(view.container).style.background).toBe(rendered(avatarBackground(colorById("teal")))),
    );
    expect(view.inspection.rpcCalls.filter((call) => call.method === "colors_get")).toHaveLength(2);
  });
});
