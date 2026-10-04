// Pinned chats in bb's manual order, reorderable by drag. The order is
// global across folders, so neighbours come from all pins; until bb sends the
// new order back, the list shows the one we asked for.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSdk } from "@get-bb/plugin-sdk/app";

import { pinNeighbors, type Chat } from "@/lib/model";

export function usePinnedOrder(chats: readonly Chat[], failureMessage: string) {
  const sdk = useSdk();
  const pinnedOrder = useMemo(
    () => chats.filter((chat) => chat.thread.isPinned).map((chat) => chat.thread.id),
    [chats],
  );
  const [optimistic, setOptimistic] = useState<string[] | null>(null);
  const pinnedKey = pinnedOrder.join(",");
  useEffect(() => setOptimistic(null), [pinnedKey]);

  const ordered = useMemo(() => {
    if (optimistic === null) return chats;
    const rank = new Map(optimistic.map((id, index) => [id, index]));
    const pinned = chats
      .filter((chat) => chat.thread.isPinned)
      .sort((a, b) => (rank.get(a.thread.id) ?? 0) - (rank.get(b.thread.id) ?? 0));
    return [...pinned, ...chats.filter((chat) => !chat.thread.isPinned)];
  }, [chats, optimistic]);

  /** Move a pinned chat before or after another one. */
  const movePin = (dragged: string, target: string, place: "before" | "after") => {
    const plan = pinNeighbors(optimistic ?? pinnedOrder, dragged, target, place);
    if (plan === null) return;
    setOptimistic(plan.order);
    sdk.threads
      .reorderPinned({ threadId: dragged, previousThreadId: plan.previousThreadId, nextThreadId: plan.nextThreadId })
      .catch((cause: unknown) => {
        setOptimistic(null);
        toast.error(failureMessage, { description: cause instanceof Error ? cause.message : String(cause) });
      });
  };

  return { ordered, movePin };
}
