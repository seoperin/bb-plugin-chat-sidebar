// The folder layout on the backend: one current layout with a revision, and
// the layouts it replaced.
//
// The revision guards against a stale device: a save names the revision it
// was made on, and a save made on an older one is refused with the current
// layout, so a phone that was offline cannot quietly put back yesterday's
// folders. Every save keeps what it replaced, so any layout of the last
// HISTORY_LIMIT saves can be brought back, including the folders a reset
// removed.
//
// Backend only, but free of the SDK: it takes the storage it needs, so tests
// run it on a map.
import { normalizeLayout, type FolderLayout } from "./folders";

export const HISTORY_LIMIT = 20;

const LAYOUT_KEY = "folders";
const REVISION_KEY = "folders-revision";
const HISTORY_KEY = "folders-history";

export interface FolderStorage {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface FolderState {
  /** Null until the user arranges the folders. */
  layout: FolderLayout | null;
  revision: number;
}

export interface HistoryEntry {
  /** The revision this layout had while it was current. */
  revision: number;
  /** When it stopped being current. */
  replacedAt: number;
  layout: FolderLayout | null;
}

export type SaveResult = ({ ok: true } | { ok: false }) & FolderState;

export function createFolderStore(storage: FolderStorage, publish: (state: FolderState) => void) {
  // Saves run one after another, so the revision check and the write are one step.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  };

  const read = async (): Promise<FolderState> => {
    const stored = await storage.get<FolderLayout | null>(LAYOUT_KEY);
    const revision = (await storage.get<number>(REVISION_KEY)) ?? 0;
    return { layout: stored == null ? null : normalizeLayout(stored), revision };
  };

  const history = async (): Promise<HistoryEntry[]> => (await storage.get<HistoryEntry[]>(HISTORY_KEY)) ?? [];

  /** Make `layout` current, keeping what it replaces. */
  const replace = async (current: FolderState, layout: FolderLayout | null): Promise<FolderState> => {
    const past = await history();
    await storage.set(
      HISTORY_KEY,
      [{ revision: current.revision, replacedAt: Date.now(), layout: current.layout }, ...past].slice(0, HISTORY_LIMIT),
    );
    const next: FolderState = {
      layout: layout === null ? null : normalizeLayout(layout),
      revision: current.revision + 1,
    };
    if (next.layout === null) await storage.delete(LAYOUT_KEY);
    else await storage.set(LAYOUT_KEY, next.layout);
    await storage.set(REVISION_KEY, next.revision);
    publish(next);
    return next;
  };

  return {
    get: read,

    save: (layout: FolderLayout | null, baseRevision: number): Promise<SaveResult> =>
      serial(async () => {
        const current = await read();
        if (current.revision !== baseRevision) return { ok: false, ...current };
        return { ok: true, ...(await replace(current, layout)) };
      }),

    history: async () =>
      (await history()).map(({ revision, replacedAt, layout }) => ({ revision, replacedAt, layout })),

    /** Bring back the layout that had `revision`; the current one goes into history like any save. */
    restore: (revision: number): Promise<FolderState | null> =>
      serial(async () => {
        const entry = (await history()).find((candidate) => candidate.revision === revision);
        if (entry === undefined) return null;
        return replace(await read(), entry.layout);
      }),
  };
}
