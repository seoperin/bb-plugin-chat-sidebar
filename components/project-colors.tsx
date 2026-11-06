// Project colours for avatars, folders, and headings. Picks come from the
// backend (shared by every device) and arrive live over realtime; projects
// without a pick get distinct automatic colours (see `lib/colors.ts`).
//
// The last colours seen are kept for the page and in localStorage, so a list
// that bb mounts again, or a reload, starts from them instead of falling back
// to automatic colours while the backend answers.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  type PluginSidebarProject,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";

import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { Icon } from "@/components/ui/icon";
import {
  COLORS_CHANNEL,
  PALETTE,
  THREAD_COLORS_CHANNEL,
  assignProjectColors,
  colorById,
  colorForKey,
  isColorId,
  swatch,
  type ColorId,
  type PaletteColor,
} from "@/lib/colors";
import type { MessageKey } from "@/lib/i18n";
import { rootOf } from "@/lib/model";
import type { ProjectColorMap, rpcContract } from "@/lib/rpc";
import { readStored, writeStored } from "@/lib/storage";
import { useT } from "./chat-context";

interface ProjectColorsValue {
  /** The project's colour; without a project, a stable colour for `fallbackKey`. */
  colorOf(projectId: string | null, fallbackKey: string): PaletteColor;
  /** The colour the user picked, or null for automatic. */
  pickOf(projectId: string): ColorId | null;
  setColor(projectId: string, color: ColorId | null): void;
  /** The colour of the thread's branch: its root's pick, else the project's. */
  threadColorOf(thread: PluginSidebarThread, projectId: string | null): PaletteColor;
  /** Whether the thread heads its own branch, and so can have its own colour. */
  isRootThread(thread: PluginSidebarThread): boolean;
  threadPickOf(threadId: string): ColorId | null;
  setThreadColor(threadId: string, color: ColorId | null): void;
}

const ProjectColorsContext = createContext<ProjectColorsValue | null>(null);

function sanitize(value: unknown): ProjectColorMap {
  const colors: ProjectColorMap = {};
  if (value === null || typeof value !== "object") return colors;
  for (const [projectId, color] of Object.entries(value)) {
    if (isColorId(color)) colors[projectId] = color;
  }
  return colors;
}

/** Backend retries after a failed load, in milliseconds. */
const RETRIES = [1_000, 3_000, 10_000];

interface PickMemory {
  storageKey: string;
  /** Last colours seen on this page; outlives a list that bb mounts again. */
  remembered: ProjectColorMap | null;
}

const PROJECT_MEMORY: PickMemory = { storageKey: "chat-sidebar/project-colors", remembered: null };
const THREAD_MEMORY: PickMemory = { storageKey: "chat-sidebar/thread-colors", remembered: null };

function recall(memory: PickMemory): ProjectColorMap {
  memory.remembered ??= readStored(memory.storageKey, (raw) => sanitize(JSON.parse(raw)), {});
  return memory.remembered;
}

function remember(memory: PickMemory, colors: ProjectColorMap): void {
  memory.remembered = colors;
  writeStored(memory.storageKey, JSON.stringify(colors));
}

function usePicks(memory: PickMemory, method: "colors_get" | "thread_colors_get", channel: string) {
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const [picks, setPicksState] = useState<ProjectColorMap>(() => recall(memory));
  const setPicks = useCallback((next: ProjectColorMap) => {
    remember(memory, next);
    setPicksState(next);
  }, [memory]);

  // Load on mount, retrying while the backend is unavailable, and again
  // whenever the realtime connection comes back: colours published while it
  // was down are not replayed.
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
        .call(method, null)
        .then((colors) => alive && setPicks(sanitize(colors)))
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
  }, [generation, method, setPicks]);
  useRealtime(channel, (payload) => setPicks(sanitize(payload)));

  return { picks, setPicks, rpcRef };
}

export function ProjectColorsProvider({
  projects,
  threads,
  children,
}: {
  projects: readonly PluginSidebarProject[];
  threads: readonly PluginSidebarThread[];
  children: ReactNode;
}) {
  const t = useT();
  const { picks, setPicks, rpcRef } = usePicks(PROJECT_MEMORY, "colors_get", COLORS_CHANNEL);
  const { picks: threadPicks, setPicks: setThreadPicks } = usePicks(THREAD_MEMORY, "thread_colors_get", THREAD_COLORS_CHANNEL);
  const threadsById = useMemo(() => new Map(threads.map((thread) => [thread.id, thread])), [threads]);

  const projectIds = useMemo(() => projects.map((project) => project.id), [projects]);
  const value = useMemo<ProjectColorsValue>(() => {
    const assigned = assignProjectColors(projectIds, picks);
    const colorOf = (projectId: string | null, fallbackKey: string) =>
      (projectId !== null ? assigned.get(projectId) : undefined) ?? colorForKey(projectId ?? fallbackKey);
    return {
      colorOf,
      threadColorOf: (thread, projectId) => {
        const root = rootOf(thread, threadsById);
        const pick = threadPicks[root.id];
        return pick !== undefined ? colorById(pick) : colorOf(projectId, root.id);
      },
      isRootThread: (thread) => rootOf(thread, threadsById).id === thread.id,
      threadPickOf: (threadId) => threadPicks[threadId] ?? null,
      setThreadColor: (threadId, color) => {
        const previous = threadPicks;
        const next = { ...threadPicks };
        if (color === null) delete next[threadId];
        else next[threadId] = color;
        setThreadPicks(next);
        rpcRef.current
          .call("thread_colors_set", { threadId, color })
          .then((colors) => setThreadPicks(sanitize(colors)))
          .catch((cause: unknown) => {
            setThreadPicks(previous);
            toast.error(t("toast.colorFailed"), {
              description: cause instanceof Error ? cause.message : String(cause),
            });
          });
      },
      pickOf: (projectId) => picks[projectId] ?? null,
      setColor: (projectId, color) => {
        const previous = picks;
        const next = { ...picks };
        if (color === null) delete next[projectId];
        else next[projectId] = color;
        setPicks(next);
        rpcRef.current
          .call("colors_set", { projectId, color })
          .then((colors) => setPicks(sanitize(colors)))
          .catch((cause: unknown) => {
            setPicks(previous);
            toast.error(t("toast.colorFailed"), {
              description: cause instanceof Error ? cause.message : String(cause),
            });
          });
      },
    };
  }, [projectIds, picks, threadPicks, threadsById, setPicks, setThreadPicks, rpcRef, t]);

  return <ProjectColorsContext.Provider value={value}>{children}</ProjectColorsContext.Provider>;
}

export function useProjectColors(): ProjectColorsValue {
  const value = useContext(ProjectColorsContext);
  if (value === null) throw new Error("useProjectColors() must be used inside <ProjectColorsProvider>");
  return value;
}

/** "Project colour" submenu for any context menu that belongs to a project. */
export function ProjectColorSubmenu({ projectId }: { projectId: string }) {
  const t = useT();
  const { colorOf, pickOf, setColor } = useProjectColors();
  const pick = pickOf(projectId);
  const current = colorOf(projectId, projectId);
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <span
          aria-hidden="true"
          className="size-3.5 shrink-0 rounded-full"
          style={{ background: swatch(current) }}
        />
        {t("color.menu")}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="min-w-44">
        <ContextMenuItem onSelect={() => setColor(projectId, null)}>
          <Icon name="Palette" />
          <span className="flex-1">{t("color.auto")}</span>
          {pick === null ? <Icon name="Check" className="size-3.5" /> : null}
        </ContextMenuItem>
        {PALETTE.map((color) => (
          <ContextMenuItem key={color.id} onSelect={() => setColor(projectId, color.id)}>
            <span aria-hidden="true" className="size-3.5 shrink-0 rounded-full" style={{ background: swatch(color) }} />
            <span className="flex-1">{t(`color.${color.id}` as MessageKey)}</span>
            {pick === color.id ? <Icon name="Check" className="size-3.5" /> : null}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
