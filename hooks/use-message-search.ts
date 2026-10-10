// Search inside conversations, through bb's own thread search: a query of a
// few letters finds the chats whose messages mention it, and the best match
// is shown under the chat's title the way bb's search does. Titles are still
// matched locally and at once; this adds the chats that only their messages
// would find. Results arrive after a short pause in typing, and a newer query
// cancels the request before it.
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

export interface MessageSearch {
  /** The best message match per thread id; titles are left to the local search. */
  matches: ReadonlyMap<string, MessageMatch>;
  /** The query these matches are for, so stale ones are never shown for a new query. */
  query: string;
  loading: boolean;
}

const EMPTY: MessageSearch = { matches: new Map(), query: "", loading: false };
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
          setState({ matches, query: trimmed, loading: false });
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
