// Search inside conversations, through bb's own thread search: a query of a
// few letters finds the chats whose messages mention it, and the best match
// is shown under the chat's title the way bb's search does. Titles are still
// matched locally and at once; this adds the chats that only their messages
// would find. Results arrive after a short pause in typing, and a newer query
// cancels the request before it.
//
// Archived chats come back too. bb hands the list its archive a page at a
// time, so a hit there is kept with the thread fields the search returns,
// and the list can show it whether or not that page is loaded.
import { useEffect, useState } from "react";
import { useSdk } from "@get-bb/plugin-sdk/app";
import { titleSearchScore } from "@/lib/search";

export const MIN_MESSAGE_QUERY = 3;
const DEBOUNCE_MS = 250;
const LIMIT = "50";
const TITLE_PAGE_SIZE = 100;

export interface MessageMatch {
  threadId: string;
  text: string;
  highlightRanges: readonly { start: number; end: number }[];
  from: "user" | "assistant" | "system";
}

/** A chat in the archive the search found, by its title or its messages. */
export interface ArchivedHit {
  id: string;
  title: string;
  projectId: string;
  providerId: string;
  branch: string | null;
  updatedAt: number;
  /** The message it was found by; null when its title matched. */
  match: MessageMatch | null;
}

export interface MessageSearch {
  /** The best message match per thread id; titles are left to the local search. */
  matches: ReadonlyMap<string, MessageMatch>;
  /** Hits in the archive, newest first. */
  archived: readonly ArchivedHit[];
  /** The query these matches are for, so stale ones are never shown for a new query. */
  query: string;
  loading: boolean;
  error: boolean;
  truncated: boolean;
}

const EMPTY: MessageSearch = { matches: new Map(), archived: [], query: "", loading: false, error: false, truncated: false };
const FROM = { user_message: "user", assistant_message: "assistant", system_message: "system" } as const;

export function useMessageSearch(query: string, includeArchived: boolean): MessageSearch {
  const sdk = useSdk();
  const [state, setState] = useState<MessageSearch>(EMPTY);
  const trimmed = query.trim();
  const searching = trimmed !== "";
  const [archiveTitles, setArchiveTitles] = useState<{ rows: ArchivedHit[]; loading: boolean; error: boolean }>({ rows: [], loading: false, error: false });

  // Titles need the same matching as live chats, independent of the message-search limit.
  // Fetch metadata once per search session, not on every keystroke.
  useEffect(() => {
    if (!searching) { setArchiveTitles({ rows: [], loading: false, error: false }); return; }
    const controller = new AbortController();
    setArchiveTitles({ rows: [], loading: true, error: false });
    void (async () => {
      const rows: ArchivedHit[] = [];
      for (let offset = 0; ; offset += TITLE_PAGE_SIZE) {
        const page = await sdk.threads.list({ archived: true, limit: TITLE_PAGE_SIZE, offset, signal: controller.signal });
        if (controller.signal.aborted) return;
        rows.push(...page.map((thread) => ({ id: thread.id, title: thread.title ?? thread.titleFallback ?? thread.id,
          projectId: thread.projectId, providerId: thread.providerId, branch: thread.environmentBranchName,
          updatedAt: thread.updatedAt, match: null })));
        if (page.length < TITLE_PAGE_SIZE) break;
      }
      setArchiveTitles({ rows, loading: false, error: false });
    })().catch(() => { if (!controller.signal.aborted) setArchiveTitles({ rows: [], loading: false, error: true }); });
    return () => controller.abort();
  }, [sdk, searching]);

  useEffect(() => {
    if (trimmed.length < MIN_MESSAGE_QUERY) {
      setState(EMPTY);
      return;
    }
    setState({ ...EMPTY, query: trimmed, loading: true });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      sdk.threads
        .search({ query: trimmed, limitPerGroup: LIMIT, signal: controller.signal })
        .then((response) => {
          if (controller.signal.aborted) return;
          const matches = new Map<string, MessageMatch>();
          const groups = includeArchived ? [response.archived] : [response.active];
          for (const group of groups) {
            for (const result of group.results) {
              const match = result.matches.find((candidate) => candidate.sourceKind in FROM);
              if (match === undefined || matches.has(result.thread.id)) continue;
              matches.set(result.thread.id, {
                threadId: result.thread.id,
                text: match.text,
                highlightRanges: match.highlightRanges,
                from: FROM[match.sourceKind as keyof typeof FROM],
              });
            }
          }
          const archived: ArchivedHit[] = response.archived.results.map(({ thread, matches: found }) => {
            const match = found.find((candidate) => candidate.sourceKind in FROM);
            return {
              id: thread.id,
              title: thread.title ?? thread.titleFallback ?? thread.id,
              projectId: thread.projectId,
              providerId: thread.providerId,
              branch: thread.environmentBranchName,
              updatedAt: thread.updatedAt,
              match:
                match === undefined
                  ? null
                  : {
                      threadId: thread.id,
                      text: match.text,
                      highlightRanges: match.highlightRanges,
                      from: FROM[match.sourceKind as keyof typeof FROM],
                    },
            };
          });
          const truncated = groups.some((group) => group.total > group.results.length) || response.archived.total > response.archived.results.length;
          setState({ matches, archived, query: trimmed, loading: false, error: false, truncated });
        })
        .catch(() => {
          if (!controller.signal.aborted) setState({ ...EMPTY, query: trimmed, error: true });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [sdk, trimmed, includeArchived]);

  if (!searching) return EMPTY;
  const current = state.query === trimmed ? state : { ...EMPTY, loading: trimmed.length >= MIN_MESSAGE_QUERY };
  const archived = new Map(archiveTitles.rows.filter((hit) => titleSearchScore(hit.title, trimmed) > 0).map((hit) => [hit.id, hit]));
  for (const hit of current.archived) if (!archived.has(hit.id)) archived.set(hit.id, hit);
  return { ...current,
    archived: [...archived.values()].sort((a, b) => titleSearchScore(b.title, trimmed) - titleSearchScore(a.title, trimmed) || b.updatedAt - a.updatedAt),
    loading: current.loading || archiveTitles.loading, error: current.error || archiveTitles.error };
}
