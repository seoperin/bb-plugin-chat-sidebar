// The folder layout: stored by the backend so it follows the user across
// devices, derived from the settings until the user arranges it.
//
// Edits apply at once and save in the background, one after another: the
// first on the revision the list showed, each next one on the revision the
// one before left. A save the backend refuses because another device saved
// first brings in that newer layout instead of overwriting it, and the saves
// queued behind it are dropped, since they build on the layout it refused.
// A failed save puts the last saved layout back. Deleting a
// folder or going back to the default folders can be undone from the toast,
// and the editor's history brings back any of the last layouts.
//
// The layout seen last is remembered on this page, so a list that bb mounts
// again does not flash the default.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";

import { useReorderDnd } from "@/hooks/use-sortable";
import type { FolderState, HistoryEntry } from "@/lib/folder-store";
import {
  defaultLayout,
  FOLDERS_CHANNEL,
  moveEntry,
  normalizeLayout,
  type FolderEntry,
  type FolderLayout,
} from "@/lib/folders";
import type { rpcContract } from "@/lib/rpc";
import { readStored, writeStored } from "@/lib/storage";
import { useChat } from "./chat-context";

const STORAGE_KEY = "chat-sidebar/folders";
const RETRIES = [1_000, 3_000, 10_000];
const UNDO_MS = 8_000;

interface FoldersValue {
  layout: FolderLayout;
  /** The user has arranged the folders (otherwise they follow the settings). */
  customized: boolean;
  setLayout: (next: FolderLayout) => void;
  updateEntry: (id: string, patch: Partial<FolderEntry>) => void;
  /** Delete a custom folder, with "Undo" in the toast. */
  deleteEntry: (id: string, name: string) => void;
  /** Back to the folders the settings describe, with "Undo" in the toast. */
  reset: () => void;
  loadHistory: () => Promise<HistoryEntry[]>;
  restore: (revision: number) => void;
  /** The editor: open on the folder list, or on one folder. */
  editing: Editing | null;
  openEditor: (entryId?: string | null, options?: { focusName?: boolean }) => void;
  closeEditor: () => void;
}

interface Editing {
  entryId: string | null;
  /** The folder was just made: its name field takes the focus. */
  focusName: boolean;
}

const FoldersContext = createContext<FoldersValue | null>(null);

/** `undefined` until the backend answers for the first time on this page. */
let remembered: FolderState | undefined;

function parse(raw: string): FolderState | undefined {
  const value = JSON.parse(raw) as Partial<FolderState> | null;
  if (value === null || typeof value !== "object" || typeof value.revision !== "number") return undefined;
  const layout = value.layout;
  if (layout !== null && (typeof layout !== "object" || !Array.isArray(layout?.entries))) return undefined;
  return { layout: layout === null ? null : normalizeLayout(layout!), revision: value.revision };
}

function recall(): FolderState | undefined {
  if (remembered === undefined) remembered = readStored(STORAGE_KEY, parse, undefined);
  return remembered;
}

function remember(state: FolderState): void {
  remembered = state;
  writeStored(STORAGE_KEY, JSON.stringify(state));
}

export function FoldersProvider({ children }: { children: ReactNode }) {
  const { settings, i18n } = useChat();
  const { t } = i18n;
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;

  // What the list shows, which runs ahead of the backend while saves are on their way.
  const [shown, setShownState] = useState<FolderState | undefined>(recall);
  // What the backend last confirmed.
  const confirmed = useRef<FolderState | undefined>(shown);
  // Writes still on their way; while there are any, the backend's answers wait.
  const saving = useRef(0);
  const setShown = useCallback((next: FolderState) => {
    remember(next);
    setShownState(next);
  }, []);
  const adopt = useCallback(
    (state: FolderState) => {
      confirmed.current = state;
      setShown(state);
    },
    [setShown],
  );

  // Load on mount, retrying while the backend is unavailable, and again when
  // the realtime connection comes back: a layout saved meanwhile is not replayed.
  const connection = useRealtimeConnectionState();
  const wasConnected = useRef(connection === "connected");
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const connected = connection === "connected";
    if (connected && !wasConnected.current) setGeneration((value) => value + 1);
    wasConnected.current = connected;
  }, [connection]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = (index: number) => {
      rpcRef.current
        .call("folders_get", null)
        .then((state) => {
          // A save in flight answers for itself.
          if (alive && saving.current === 0) adopt(state);
        })
        .catch(() => {
          const delay = RETRIES[index];
          if (alive && delay !== undefined) timer = setTimeout(() => attempt(index + 1), delay);
        });
    };
    attempt(0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [generation, adopt]);
  useRealtime(FOLDERS_CHANNEL, (payload) => {
    const state = payload as FolderState;
    if (typeof state?.revision !== "number") return;
    // Our own save comes back here too; anything older than what we have is stale.
    if (confirmed.current !== undefined && state.revision <= confirmed.current.revision) return;
    confirmed.current = state;
    if (saving.current === 0) setShown(state);
  });

  // Backend writes run one at a time. While any is on its way the list shows
  // the optimistic layout; once the last one is back it shows what the
  // backend holds.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  // The revision the next queued save builds on; null once one was refused
  // or a restore replaced the layout, until the queue is empty again.
  const base = useRef<number | null>(null);
  const enqueue = useCallback(
    (write: () => Promise<void>) => {
      saving.current += 1;
      chain.current = chain.current.then(async () => {
        try {
          await write();
        } catch (cause) {
          toast.error(t("toast.foldersFailed"), {
            description: cause instanceof Error ? cause.message : String(cause),
          });
        } finally {
          saving.current -= 1;
          if (saving.current === 0 && confirmed.current !== undefined) setShown(confirmed.current);
        }
      });
    },
    [setShown, t],
  );

  const save = useCallback(
    (layout: FolderLayout | null) => {
      // The first save of a run builds on what the list showed, which is what the backend confirmed.
      if (saving.current === 0) base.current = confirmed.current?.revision ?? 0;
      setShown({ layout, revision: confirmed.current?.revision ?? 0 });
      enqueue(async () => {
        if (base.current === null) return;
        const result = await rpcRef.current.call("folders_set", { layout, baseRevision: base.current });
        confirmed.current = { layout: result.layout, revision: result.revision };
        if (result.ok) {
          base.current = result.revision;
        } else {
          // Another device saved first: its layout stands, ours and the ones queued behind it are dropped.
          base.current = null;
          toast(t("toast.foldersChanged"));
        }
      });
    },
    [enqueue, setShown, t],
  );

  const restore = useCallback(
    (revision: number) =>
      enqueue(async () => {
        const state = await rpcRef.current.call("folders_restore", { revision });
        if (state === null) {
          toast.error(t("toast.historyGone"));
          return;
        }
        confirmed.current = state;
        // Saves queued behind it build on the layout it replaced.
        base.current = null;
        toast(t("toast.foldersRestored"));
      }),
    [enqueue, t],
  );

  const [editing, setEditing] = useState<Editing | null>(null);

  const value = useMemo<FoldersValue>(() => {
    const customized = shown?.layout != null;
    const layout = customized ? shown!.layout! : defaultLayout(settings);
    // The layout as of now, which an edit made in this render may already have changed.
    const latest = () => (remembered === undefined ? layout : (remembered.layout ?? defaultLayout(settings)));
    const setLayout = (next: FolderLayout) => {
      const normalized = normalizeLayout(next);
      // Nothing changed: no new revision, no history row.
      if (remembered?.layout != null && JSON.stringify(normalized) === JSON.stringify(remembered.layout)) return;
      save(normalized);
    };
    return {
      layout,
      customized,
      setLayout,
      updateEntry: (id, patch) => {
        const current = latest();
        // A field that saves as its pane closes may come after the folder was deleted.
        if (!current.entries.some((entry) => entry.id === id)) return;
        setLayout({
          ...current,
          entries: current.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
        });
      },
      deleteEntry: (id, name) => {
        const current = latest();
        const index = current.entries.findIndex((entry) => entry.id === id);
        const removed = current.entries[index];
        if (removed === undefined) return;
        setLayout({ ...current, entries: current.entries.filter((entry) => entry.id !== id) });
        toast(t("toast.folderDeleted", { name }), {
          duration: UNDO_MS,
          action: {
            label: t("toast.undo"),
            // Put it back where it was, into whatever the layout is by then.
            onClick: () => {
              const now = latest();
              const entries = [...now.entries];
              entries.splice(Math.min(index, entries.length), 0, removed);
              save(normalizeLayout({ ...now, entries }));
            },
          },
        });
      },
      reset: () => {
        const before = layout;
        save(null);
        toast(t("toast.foldersReset"), {
          duration: UNDO_MS,
          action: { label: t("toast.undo"), onClick: () => save(before) },
        });
      },
      loadHistory: () => rpcRef.current.call("folders_history", null),
      restore,
      editing,
      openEditor: (entryId = null, options) => setEditing({ entryId, focusName: options?.focusName === true }),
      closeEditor: () => setEditing(null),
    };
  }, [shown, settings, save, restore, editing, t]);

  return <FoldersContext.Provider value={value}>{children}</FoldersContext.Provider>;
}

export function useFolders(): FoldersValue {
  const value = useContext(FoldersContext);
  if (value === null) throw new Error("useFolders() must be used inside <FoldersProvider>");
  return value;
}

/**
 * Drag folders (by layout entry id) in the rail, the tabs or the editor's
 * list, and save the new order. Hidden folders keep their place among the rest.
 */
export function useFolderDnd(axis: "vertical" | "horizontal") {
  const { layout, setLayout } = useFolders();
  return useReorderDnd({
    axis,
    onMove: (dragged, target, place) => {
      const entries = moveEntry(layout.entries, dragged, target, place);
      if (entries !== null) setLayout({ ...layout, entries });
    },
  });
}
