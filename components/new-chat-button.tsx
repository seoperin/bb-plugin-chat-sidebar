// "+" for a new chat, aware of the open folder: in a project's folder (or a
// custom folder about one project) it starts the chat in that project, in a
// section's folder it files it there, elsewhere it opens bb's New thread as
// usual. Right-click to pick any project.
import { useBbNavigate, type PluginSidebarProject } from "@get-bb/plugin-sdk/app";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Icon } from "@/components/ui/icon";
import { swatch } from "@/lib/colors";
import { composeTarget, type Folder } from "@/lib/model";
import { cn } from "@/lib/utils";
import { useT } from "./chat-context";
import { useFolderLabel } from "./folder-menu";
import { useProjectColors } from "./project-colors";

export function NewChatButton({
  folder,
  projects,
  onNavigate,
  className,
}: {
  /** The open folder, or null while folders are still loading. */
  folder: Folder | null;
  /** Projects to offer on right-click, in order of use. */
  projects: readonly PluginSidebarProject[];
  onNavigate: () => void;
  className?: string;
}) {
  const t = useT();
  const label = useFolderLabel();
  const navigate = useBbNavigate();
  const { colorOf } = useProjectColors();

  const startIn = folder?.startIn ?? null;
  const title = folder !== null && startIn !== null ? t("newChat.in", { name: label(folder) }) : t("newChat.label");

  const start = (options: { projectId?: string; sectionId?: string }) => {
    navigate.toCompose({ ...composeTarget(options), focusPrompt: true });
    onNavigate();
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          aria-label={title}
          title={title}
          onClick={() => start(startIn ?? {})}
          className={cn(
            "grid size-7 shrink-0 cursor-pointer place-items-center rounded-full bg-sidebar-accent/70 text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Icon name="Plus" className="size-4" />
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-52 max-w-72">
        <ContextMenuLabel className="text-xs text-muted-foreground">{t("newChat.pick")}</ContextMenuLabel>
        {projects.map((project) => (
          <ContextMenuItem key={project.id} onSelect={() => start({ projectId: project.id })}>
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ background: swatch(colorOf(project.id, project.id)) }}
            />
            <span className="truncate">{project.isPersonal ? t("folder.personal") : project.name}</span>
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
