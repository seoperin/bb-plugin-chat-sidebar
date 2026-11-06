// Each chat's icon on its avatar. Without a pick the icon comes from the
// chat's title (see `lib/chat-icons.ts`); a pick from the chat's menu wins and
// syncs across devices through the backend, arriving live. The last picks
// seen are kept in localStorage, so a reload starts from them.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { CHAT_ICONS_CHANNEL, autoChatIcon, sanitizeChatIcons, type ChatIconMap } from "@/lib/chat-icons";
import { FOLDER_ICONS } from "@/lib/folders";
import type { rpcContract } from "@/lib/rpc";
import { readStored, writeStored } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { useT } from "./chat-context";

interface ChatIconTarget {
  id: string;
  title: string;
}

interface ChatIconsValue {
  /** The pick, else the icon from the title. */
  iconOf(threadId: string, title: string): string;
  /** The icon picked by hand, or null for the one from the title. */
  pickOf(threadId: string): string | null;
  openPicker(target: ChatIconTarget): void;
}

const STORAGE_KEY = "chat-sidebar/chat-icons";

const ChatIconsContext = createContext<ChatIconsValue>({
  iconOf: (threadId, title) => autoChatIcon(title, threadId),
  pickOf: () => null,
  openPicker: () => {},
});

export function ChatIconsProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const [picks, setPicksState] = useState<ChatIconMap>(() =>
    readStored(STORAGE_KEY, (raw) => sanitizeChatIcons(JSON.parse(raw)), {}),
  );
  const [target, setTarget] = useState<ChatIconTarget | null>(null);
  const setPicks = useCallback((next: ChatIconMap) => {
    writeStored(STORAGE_KEY, JSON.stringify(next));
    setPicksState(next);
  }, []);

  // Load on mount and whenever the realtime connection comes back: picks
  // published while it was down are not replayed.
  const connection = useRealtimeConnectionState();
  useEffect(() => {
    if (connection !== "connected") return;
    rpcRef.current
      .call("chaticons_get", null)
      .then((stored) => setPicks(sanitizeChatIcons(stored)))
      .catch(() => undefined);
  }, [connection, setPicks]);
  useRealtime(CHAT_ICONS_CHANNEL, (payload) => setPicks(sanitizeChatIcons(payload)));

  const picksRef = useRef(picks);
  picksRef.current = picks;
  const save = useCallback(
    (threadId: string, icon: string | null) => {
      const previous = picksRef.current;
      const next = { ...previous };
      delete next[threadId];
      if (icon !== null) next[threadId] = icon;
      setPicks(next);
      rpcRef.current
        .call("chaticons_set", { threadId, icon })
        .then((stored) => setPicks(sanitizeChatIcons(stored)))
        .catch((cause: unknown) => {
          setPicks(previous);
          toast.error(t("chatIcon.failed"), { description: cause instanceof Error ? cause.message : String(cause) });
        });
    },
    [setPicks, t],
  );

  const value = useMemo<ChatIconsValue>(
    () => ({
      iconOf: (threadId, title) => picks[threadId] ?? autoChatIcon(title, threadId),
      pickOf: (threadId) => picks[threadId] ?? null,
      openPicker: setTarget,
    }),
    [picks],
  );

  return (
    <ChatIconsContext.Provider value={value}>
      {children}
      <ChatIconPicker
        target={target}
        pick={target === null ? null : (picks[target.id] ?? null)}
        onPick={(icon) => {
          if (target !== null) save(target.id, icon);
          setTarget(null);
        }}
        onClose={() => setTarget(null)}
      />
    </ChatIconsContext.Provider>
  );
}

export function useChatIcons(): ChatIconsValue {
  return useContext(ChatIconsContext);
}

function ChatIconPicker({
  target,
  pick,
  onPick,
  onClose,
}: {
  target: ChatIconTarget | null;
  pick: string | null;
  onPick: (icon: string | null) => void;
  onClose: () => void;
}) {
  const t = useT();
  const auto = target === null ? null : autoChatIcon(target.title, target.id);
  const cell =
    "grid aspect-square cursor-pointer place-items-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <Dialog open={target !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-sm gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 pb-3 pt-4">
          <DialogTitle className="text-base">{t("chatIcon.title")}</DialogTitle>
          <DialogDescription className="truncate text-xs">{target?.title ?? ""}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {auto !== null ? (
            <button
              type="button"
              onClick={() => onPick(null)}
              aria-pressed={pick === null}
              className={cn(
                "mb-3 flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                pick === null ? "bg-accent" : "hover:bg-accent",
              )}
            >
              <Icon name={auto} className="size-4 shrink-0" />
              <span className="flex-1 text-left">{t("chatIcon.auto")}</span>
              {pick === null ? <Icon name="Check" className="size-3.5" /> : null}
            </button>
          ) : null}
          <div
            role="radiogroup"
            aria-label={t("chatIcon.title")}
            className="grid grid-cols-[repeat(auto-fill,minmax(32px,1fr))] gap-1"
          >
            {FOLDER_ICONS.map((icon) => {
              const selected = pick === icon;
              const name = icon.replace(/^chat-sidebar\//, "");
              return (
                <button
                  key={icon}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  title={name}
                  aria-label={name}
                  onClick={() => onPick(icon)}
                  className={cn(
                    cell,
                    selected
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon name={icon} className="size-4" />
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
