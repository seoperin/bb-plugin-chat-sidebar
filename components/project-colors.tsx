// Project colours for avatars, folders, and headings. Picks come from the
// backend (shared by every device) and arrive live over realtime; projects
// without a pick get distinct automatic colours (see `lib/colors.ts`).
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useRealtime, useRpc, type PluginSidebarProject } from "@get-bb/plugin-sdk/app";

import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { Icon } from "@/components/ui/icon";
import {
  PALETTE,
  assignProjectColors,
  colorForKey,
  isColorId,
  swatch,
  type ColorId,
  type PaletteColor,
} from "@/lib/colors";
import type { MessageKey } from "@/lib/i18n";
import { COLORS_CHANNEL, type ProjectColorMap, type rpcContract } from "@/lib/rpc";
import { useT } from "./chat-context";

interface ProjectColorsValue {
  /** The project's colour; without a project, a stable colour for `fallbackKey`. */
  colorOf(projectId: string | null, fallbackKey: string): PaletteColor;
  /** The colour the user picked, or null for automatic. */
  pickOf(projectId: string): ColorId | null;
  setColor(projectId: string, color: ColorId | null): void;
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

export function ProjectColorsProvider({
  projects,
  children,
}: {
  projects: readonly PluginSidebarProject[];
  children: ReactNode;
}) {
  const t = useT();
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const [picks, setPicks] = useState<ProjectColorMap>({});

  useEffect(() => {
    let alive = true;
    rpcRef.current
      .call("colors_get", null)
      .then((colors) => alive && setPicks(sanitize(colors)))
      .catch(() => undefined); // Automatic colours until the backend answers.
    return () => {
      alive = false;
    };
  }, []);
  useRealtime(COLORS_CHANNEL, (payload) => setPicks(sanitize(payload)));

  const projectIds = useMemo(() => projects.map((project) => project.id), [projects]);
  const value = useMemo<ProjectColorsValue>(() => {
    const assigned = assignProjectColors(projectIds, picks);
    return {
      colorOf: (projectId, fallbackKey) =>
        (projectId !== null ? assigned.get(projectId) : undefined) ?? colorForKey(projectId ?? fallbackKey),
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
  }, [projectIds, picks, t]);

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
