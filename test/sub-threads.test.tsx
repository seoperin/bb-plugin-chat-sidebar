// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

import app from "../app";
import { NOW, project, thread } from "./fixtures";

beforeAll(() => {
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

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// A lead with a chain six levels deep, plus a second worker beside the first.
const threads = [
  thread("lead", { title: "Lead", updatedAt: NOW }),
  thread("w1", { title: "Worker 1", parentThreadId: "lead", updatedAt: NOW - 1_000 }),
  thread("w1a", { title: "Worker 1a", parentThreadId: "w1" }),
  thread("w1b", { title: "Worker 1b", parentThreadId: "w1a" }),
  thread("w1c", { title: "Worker 1c", parentThreadId: "w1b" }),
  thread("w1d", { title: "Worker 1d", parentThreadId: "w1c" }),
  thread("w1e", { title: "Worker 1e", parentThreadId: "w1d" }),
  thread("w2", { title: "Worker 2", parentThreadId: "lead", updatedAt: NOW - 2_000 }),
];

async function render(activeThreadId: string | null = null) {
  const loaded = await loadPluginApp(app);
  const registration = loaded.threadLists[0];
  if (registration === undefined) throw new Error("thread list is not registered");
  return renderSlot(
    registration,
    { activeThreadId, activeProjectId: null, isCompactViewport: false, onNavigate: vi.fn(), searchQuery: "" },
    {
      sidebarThreads: { status: "ready", threads, projects: [project("proj_a", "Alpha")], sections: [] },
      settings: { language: "English", expandChildren: true },
    },
  );
}

function childRows(): HTMLAnchorElement[] {
  return [...document.querySelectorAll<HTMLAnchorElement>(".border-l a[data-chat-anchor]")];
}

describe("expandable sub-agents", () => {
  it("opens a deep tree depth first and stops indenting after four levels", async () => {
    await render();
    expect(childRows()).toHaveLength(0);
    fireEvent.click(await screen.findByRole("button", { name: "Show 7 sub-agents" }));
    const rows = childRows();
    expect(rows.map((row) => row.querySelector(".truncate")?.textContent)).toEqual([
      "Worker 1",
      "Worker 1a",
      "Worker 1b",
      "Worker 1c",
      "Worker 1d",
      "Worker 1e",
      "Worker 2",
    ]);
    expect(rows.map((row) => row.style.paddingLeft)).toEqual(["6px", "18px", "30px", "42px", "42px", "42px", "6px"]);
  });

  it("highlights the open sub-agent instead of its chat", async () => {
    await render("w1e");
    fireEvent.click(await screen.findByRole("button", { name: "Show 7 sub-agents" }));
    const current = document.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toContain("Worker 1e");
  });
});
