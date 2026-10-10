// Quick buttons on a row, the way bb's own rows have them: up to three thread
// actions, picked by the user from everything bb's thread menu offers (bb's
// own actions and other plugins'), shown at the row's right edge on hover.
// None are picked to begin with, so rows look as before until the user picks.
// The pick syncs across devices through the backend and arrives live.
//
// An action with choices (bb's per-thread notifications, a project's colour)
// opens its choices as a small menu under the button.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  experimental_Icon as RegisteredIcon,
  experimental_useThreadActionRegistrations,
  experimental_useThreadActions,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  type PluginSidebarThread,
  type PluginThreadActionEntry,
} from "@get-bb/plugin-sdk/app";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import type { rpcContract } from "@/lib/rpc";
import { MAX_ROW_ACTIONS, ROW_ACTIONS_CHANNEL, sanitizeRowActions } from "@/lib/row-actions";
import { readStored, writeStored } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { useT } from "./chat-context";
import { toActionTarget } from "./thread-actions";

interface RowActionsValue {
  keys: readonly string[];
  openPicker: () => void;
}

const RowActionsContext = createContext<RowActionsValue>({ keys: [], openPicker: () => {} });
const STORAGE_KEY = "chat-sidebar/row-actions";

export function RowActionsProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const [keys, setKeysState] = useState<string[]>(() =>
    readStored(STORAGE_KEY, (raw) => sanitizeRowActions(JSON.parse(raw)), []),
  );
  const [picking, setPicking] = useState(false);
  const setKeys = (next: string[]) => {
    writeStored(STORAGE_KEY, JSON.stringify(next));
    setKeysState(next);
  };

  // Load on mount and whenever the realtime connection comes back.
  const connection = useRealtimeConnectionState();
  useEffect(() => {
    if (connection !== "connected") return;
    rpcRef.current
      .call("rowactions_get", null)
      .then((stored) => setKeys(sanitizeRowActions(stored)))
      .catch(() => undefined);
  }, [connection]);
  useRealtime(ROW_ACTIONS_CHANNEL, (payload) => setKeys(sanitizeRowActions(payload)));

  const save = (next: string[]) => {
    const previous = keys;
    setKeys(next);
    rpcRef.current.call("rowactions_set", { keys: next }).catch((cause: unknown) => {
      setKeys(previous);
      toast.error(t("rowActions.failed"), { description: cause instanceof Error ? cause.message : String(cause) });
    });
  };

  const value = useMemo(() => ({ keys, openPicker: () => setPicking(true) }), [keys]);
  return (
    <RowActionsContext.Provider value={value}>
      {children}
      <RowActionsPicker open={picking} keys={keys} onSave={save} onClose={() => setPicking(false)} />
    </RowActionsContext.Provider>
  );
}

export function useRowActions(): RowActionsValue {
  return useContext(RowActionsContext);
}

/** Every registered thread action with a checkbox; the ticked ones, in menu order, become the row's buttons. */
function RowActionsPicker({
  open,
  keys,
  onSave,
  onClose,
}: {
  open: boolean;
  keys: readonly string[];
  onSave: (next: string[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const registrations = experimental_useThreadActionRegistrations();
  const toggle = (key: string) => {
    const picked = new Set(keys);
    if (picked.has(key)) picked.delete(key);
    else if (picked.size < MAX_ROW_ACTIONS) picked.add(key);
    else return;
    onSave(registrations.map((registration) => registration.key).filter((candidate) => picked.has(candidate)));
  };
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-sm gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 pb-3 pt-4">
          <DialogTitle className="text-base">{t("rowActions.title")}</DialogTitle>
          <DialogDescription className="text-xs">{t("rowActions.hint", { count: MAX_ROW_ACTIONS })}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-[60vh] overflow-y-auto p-2">
          {registrations.map((registration) => {
            const checked = keys.includes(registration.key);
            const full = !checked && keys.length >= MAX_ROW_ACTIONS;
            return (
              <li key={registration.key}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-accent",
                    full && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={full}
                    onChange={() => toggle(registration.key)}
                    className="size-4 accent-[color:var(--chat-working)]"
                  />
                  <RegisteredIcon name={registration.icon} className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{registration.title}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

const BUTTON =
  "grid size-6 cursor-pointer place-items-center rounded-md text-muted-foreground outline-none hover:bg-background/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

function ActionButton({ entry }: { entry: PluginThreadActionEntry }) {
  const [running, setRunning] = useState(false);
  const { action } = entry;
  return (
    <button
      type="button"
      title={action.label}
      aria-label={action.label}
      disabled={action.disabled || running}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setRunning(true);
        void action.run().finally(() => setRunning(false));
      }}
      className={BUTTON}
    >
      <RegisteredIcon name={action.icon} className="size-3.5" />
    </button>
  );
}

/** A button whose choices open as a menu under it. */
function ChoicesButton({ entry }: { entry: PluginThreadActionEntry }) {
  const { action } = entry;
  const choices = action.choices!;
  const label = action.detail === undefined ? action.label : `${action.label}: ${action.detail}`;
  // The menu is a context menu opened at the button: the package already
  // ships it, and it places and dismisses itself like bb's menus.
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.dispatchEvent(
      new globalThis.MouseEvent("contextmenu", { bubbles: true, clientX: box.left, clientY: box.bottom + 4 }),
    );
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          aria-haspopup="menu"
          disabled={action.disabled}
          onClick={open}
          // The row's own menu must not open as well.
          onContextMenu={(event) => event.stopPropagation()}
          className={BUTTON}
        >
          <RegisteredIcon name={action.icon} className="size-3.5" />
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="max-h-[min(24rem,calc(100vh-2rem))] min-w-44 overflow-y-auto">
        <ContextMenuLabel className="text-xs text-muted-foreground">{choices.heading ?? action.label}</ContextMenuLabel>
        {choices.items.map((choice) => (
          <ContextMenuItem key={choice.id} disabled={choice.disabled} onSelect={() => void action.run(choice.id)}>
            {choice.icon !== undefined ? <RegisteredIcon name={choice.icon} /> : null}
            <span className="flex-1 truncate">{choice.label}</span>
            {choice.selected ? <Icon name="Check" className="size-3.5" /> : null}
          </ContextMenuItem>
        ))}
        {choices.hint !== undefined ? (
          <p className="max-w-56 px-2 py-1 text-xs text-muted-foreground">{choices.hint}</p>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * The row's quick buttons, at its right edge while it is hovered or holds
 * focus. Nothing renders while none are picked.
 */
export function RowQuickActions({ thread, onRename }: { thread: PluginSidebarThread; onRename: () => void }) {
  const { keys } = useRowActions();
  const target = useMemo(() => toActionTarget(thread), [thread]);
  const entries = experimental_useThreadActions(target, { keys, requestRename: onRename });
  if (entries.length === 0) return null;
  return (
    <span
      className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md bg-sidebar-accent p-0.5 shadow-sm group-hover/row:flex group-focus-within/row:flex"
      data-chat-quick-actions=""
    >
      {entries.map((entry) =>
        entry.action.choices === undefined ? (
          <ActionButton key={entry.key} entry={entry} />
        ) : (
          <ChoicesButton key={entry.key} entry={entry} />
        ),
      )}
    </span>
  );
}
