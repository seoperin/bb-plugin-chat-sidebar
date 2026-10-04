// @vitest-environment jsdom
// Saves from the folder editor: once the backend refuses one because another
// device saved first, the saves queued behind it are dropped rather than
// sent on the newer revision, where they would overwrite that device's folders.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

import app from "../app";
import { defaultLayout, type FolderLayout } from "../lib/folders";
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
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

const mine = defaultLayout({ projects: "tabs", sectionFolders: true, archiveFolder: true });
const theirs: FolderLayout = { ...mine, entries: mine.entries.filter((entry) => entry.kind !== "sections") };

describe("folder saves", () => {
  it("drops queued saves after the backend refuses one", async () => {
    const saves: { baseRevision: number }[] = [];
    let answerFirst: (value: unknown) => void = () => undefined;
    const loaded = await loadPluginApp(app);
    const registration = loaded.threadLists[0]!;
    renderSlot(
      registration,
      { activeThreadId: null, activeProjectId: null, isCompactViewport: false, onNavigate: () => {}, searchQuery: "" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [thread("t1", { updatedAt: NOW })],
          projects: [project("proj_a", "Alpha")],
          sections: [],
        },
        settings: { language: "English" },
        rpc: {
          colors_get: () => ({}),
          folders_get: () => ({ layout: mine, revision: 5 }),
          folders_set: (input) => {
            saves.push(input as { baseRevision: number });
            // The first save is refused: another device saved revision 6.
            if (saves.length === 1) return new Promise((resolve) => (answerFirst = resolve));
            return { ok: true, layout: null, revision: saves.length + 5 };
          },
        },
      },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Edit folders" }));
    fireEvent.click(await screen.findByRole("button", { name: "Hide Archive" }));
    fireEvent.click(await screen.findByRole("button", { name: "Hide Attention" }));
    await act(async () => answerFirst({ ok: false, layout: theirs, revision: 6 }));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    expect(saves.map((save) => save.baseRevision)).toEqual([5]);
  });
});
