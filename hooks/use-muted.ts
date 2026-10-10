// The chats bb's notifications plugin has muted (see `lib/muted.ts`), for the
// folder badges and Attention. Read in batches for every active thread when
// the list mounts, when its threads change, every minute, when the window
// comes back into view, and right after a row sees its own level change
// (`refresh`), since bb sends no event for it. Without the notifications
// plugin nothing is muted.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSdk, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";

import {
  effectiveLevels,
  FALLBACK_DEFAULTS,
  NOTIFICATIONS_PLUGIN_ID,
  parseDefaults,
  parseOwnLevel,
  type NotificationDefaults,
  type NotificationLevel,
} from "@/lib/muted";

const BATCH = 200;
const REFRESH_MS = 60_000;
const SETTLE_MS = 400;

export interface MutedThreads {
  /** Thread ids whose notifications are muted, a parent's cap included. */
  muted: ReadonlySet<string>;
  /** Read the levels again soon; a row calls it when it sees its level change. */
  refresh: () => void;
}

const RefreshContext = createContext<() => void>(() => {});
export const MutedRefreshProvider = RefreshContext.Provider;

/** For a row: ask the list to read the levels again after this row's changed. */
export function useRefreshMuted(): () => void {
  return useContext(RefreshContext);
}

export function useMutedThreads(threads: readonly PluginSidebarThread[]): MutedThreads {
  const sdk = useSdk();
  const sdkRef = useRef(sdk);
  sdkRef.current = sdk;
  const [own, setOwn] = useState<ReadonlyMap<string, NotificationLevel>>(new Map());
  const [defaults, setDefaults] = useState<NotificationDefaults>(FALLBACK_DEFAULTS);
  const [tick, setTick] = useState(0);

  // Only the set of ids matters for what to read, not every status change.
  const ids = useMemo(() => threads.map((thread) => thread.id).sort(), [threads]);
  const idsKey = ids.join(",");

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const { signal } = controller;
      void (async () => {
        try {
          const settings = await sdkRef.current.plugins.getSettings({ pluginId: NOTIFICATIONS_PLUGIN_ID, signal });
          setDefaults(parseDefaults(settings.values));
        } catch {
          // Not installed or not readable: bb's defaults, and only own levels count.
        }
        const next = new Map<string, NotificationLevel>();
        try {
          for (let start = 0; start < ids.length; start += BATCH) {
            const { threads: rows } = await sdkRef.current.threads.experimental_listPluginMetadata({
              pluginId: NOTIFICATIONS_PLUGIN_ID,
              threadIds: ids.slice(start, start + BATCH),
              signal,
            });
            for (const { threadId, metadata } of rows) {
              const level = parseOwnLevel(metadata);
              if (level !== null) next.set(threadId, level);
            }
          }
        } catch {
          return;
        }
        if (!signal.aborted) setOwn(next);
      })();
    }, SETTLE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `ids` changes with `idsKey`; `tick` asks for a fresh read.
  }, [idsKey, tick]);

  useEffect(() => {
    const again = () => setTick((value) => value + 1);
    const timer = setInterval(again, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") again();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const muted = useMemo(() => {
    const set = new Set<string>();
    if (own.size === 0 && defaults.defaultLevel !== "muted" && defaults.childLevel !== "muted") return set;
    for (const [id, level] of effectiveLevels(threads, own, defaults)) if (level === "muted") set.add(id);
    return set;
  }, [threads, own, defaults]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);
  return { muted, refresh };
}
