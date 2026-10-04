import { describe, expect, it } from "vitest";

import { createFolderStore, HISTORY_LIMIT, type FolderState } from "../lib/folder-store";
import { customEntry, defaultLayout, type FolderLayout } from "../lib/folders";

function memory(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: async <T>(key: string) => data.get(key) as T | undefined,
    set: async (key: string, value: unknown) => void data.set(key, structuredClone(value)),
    delete: async (key: string) => void data.delete(key),
  };
}

const base = defaultLayout({ projects: "tabs", sectionFolders: true, archiveFolder: true });
const withFolder = (name: string): FolderLayout => ({ ...base, entries: [...base.entries, customEntry(name, "Star")] });
const names = (layout: FolderLayout | null) =>
  layout?.entries.filter((entry) => entry.kind === "custom").map((entry) => entry.name) ?? null;

describe("folder store", () => {
  it("reads a layout saved before revisions existed as revision 0", async () => {
    const store = createFolderStore(memory({ folders: withFolder("Old") }), () => undefined);
    const state = await store.get();
    expect(state.revision).toBe(0);
    expect(names(state.layout)).toEqual(["Old"]);
  });

  it("saves on the current revision and publishes the result", async () => {
    const published: FolderState[] = [];
    const store = createFolderStore(memory(), (state) => published.push(state));
    const result = await store.save(withFolder("A"), 0);
    expect(result).toMatchObject({ ok: true, revision: 1 });
    expect(published.map((state) => state.revision)).toEqual([1]);
  });

  it("refuses a save made on an older revision and returns the current layout", async () => {
    const store = createFolderStore(memory(), () => undefined);
    await store.save(withFolder("Phone"), 0);
    const stale = await store.save(withFolder("Laptop"), 0);
    expect(stale.ok).toBe(false);
    expect(names(stale.layout)).toEqual(["Phone"]);
    expect(names((await store.get()).layout)).toEqual(["Phone"]);
  });

  it("keeps what each save replaced, newest first, and restores it", async () => {
    const store = createFolderStore(memory(), () => undefined);
    await store.save(withFolder("A"), 0);
    await store.save(null, 1); // reset
    const history = await store.history();
    expect(history.map((item) => [item.revision, names(item.layout)])).toEqual([
      [1, ["A"]],
      [0, null],
    ]);
    const restored = await store.restore(1);
    expect(restored?.revision).toBe(3);
    expect(names(restored!.layout)).toEqual(["A"]);
    // Restoring is itself undoable: the reset layout went into history.
    expect((await store.history())[0]).toMatchObject({ revision: 2, layout: null });
  });

  it("keeps a bounded history and says when a version is gone", async () => {
    const store = createFolderStore(memory(), () => undefined);
    for (let revision = 0; revision < HISTORY_LIMIT + 5; revision++) {
      await store.save(withFolder(`v${revision}`), revision);
    }
    expect(await store.history()).toHaveLength(HISTORY_LIMIT);
    expect(await store.restore(0)).toBeNull();
  });
});
