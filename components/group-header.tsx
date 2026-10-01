// A project heading in "List headers" mode: click to collapse, right-click
// to colour the project. Collapsed headings keep the unread count and the
// most urgent status visible.
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Icon } from "@/components/ui/icon";
import { mostUrgentLane, type ProjectGroup } from "@/lib/model";
import { cn } from "@/lib/utils";
import { useT } from "./chat-context";
import { ProjectColorSubmenu } from "./project-colors";

export function GroupHeader({
  group,
  collapsed,
  sticky,
  onToggle,
}: {
  group: ProjectGroup;
  collapsed: boolean;
  /** Stays under the search and tabs while its group scrolls past. */
  sticky: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const name =
    group.key === "pinned"
      ? t("folder.pinned")
      : group.project === null
        ? t("folder.other")
        : group.project.isPersonal
          ? t("folder.personal")
          : group.project.name;
  const unread = group.chats.filter((chat) => chat.unread).length;
  const lane = mostUrgentLane(group.chats);
  const header = (
    <button
      type="button"
      aria-expanded={!collapsed}
      aria-label={t(collapsed ? "folder.expand" : "folder.collapse", { name })}
      onClick={onToggle}
      className={cn(
        "flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md px-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        sticky && "sticky top-[var(--chat-top,0px)] z-[5] bg-sidebar",
      )}
    >
      <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} className="size-3 shrink-0" />
      <span className="min-w-0 truncate">{name}</span>
      {collapsed && lane !== null ? (
        <span data-lane={lane} className="chat-lane-dot size-1.5 shrink-0 rounded-full" aria-hidden="true" />
      ) : null}
      {collapsed && unread > 0 ? (
        <span className="ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-muted-foreground/20 px-1 text-[10px] font-semibold normal-case tabular-nums">
          {unread}
        </span>
      ) : null}
    </button>
  );
  if (group.project === null) return header;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{header}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <ProjectColorSubmenu projectId={group.project.id} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
