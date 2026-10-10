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

export const MIN_MESSAGE_QUERY = 3;
const DEBOUNCE_MS = 250;
const LIMIT = "50";

export interface MessageMatch {
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
}

const EMPTY: MessageSearch = { matches: new Map(), archived: [], query: "", loading: false };
const FROM = { user_message: "user", assistant_message: "assistant", system_message: "system" } as const;

export function useMessageSearch(query: string, includeArchived: boolean): MessageSearch {
  const sdk = useSdk();
  const [state, setState] = useState<MessageSearch>(EMPTY);
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < MIN_MESSAGE_QUERY) {
      setState(EMPTY);
      return;
    }
    setState((current) => ({ ...current, loading: true }));
    const controller = new AbortController();
    const timer = setTimeout(() => {
      sdk.threads
        .search({ query: trimmed, limitPerGroup: LIMIT, signal: controller.signal })
        .then((response) => {
          const matches = new Map<string, MessageMatch>();
          const groups = includeArchived ? [response.active, response.archived] : [response.active];
          for (const group of groups) {
            for (const result of group.results) {
              const match = result.matches.find((candidate) => candidate.sourceKind in FROM);
              if (match === undefined || matches.has(result.thread.id)) continue;
              matches.set(result.thread.id, {
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
                      text: match.text,
                      highlightRanges: match.highlightRanges,
                      from: FROM[match.sourceKind as keyof typeof FROM],
                    },
            };
          });
          archived.sort((a, b) => b.updatedAt - a.updatedAt);
          setState({ matches, archived, query: trimmed, loading: false });
        })
        .catch(() => {
          if (!controller.signal.aborted) setState({ ...EMPTY, query: trimmed });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [sdk, trimmed, includeArchived]);

  return state.query === trimmed ? state : { ...EMPTY, loading: state.loading };
}
