// Folders as a narrow rail on the left, like Telegram's folder sidebar: an
// icon with its name underneath, a badge for unread chats, and a dot for the
// most urgent status. Projects show their colour and initial, the same as
// their chats' avatars. The rail scrolls on its own, independently of the list.
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { Icon } from "@/components/ui/icon";
import { avatarBackground } from "@/lib/colors";
import { initialOf, type Chat, type Folder, type FolderId } from "@/lib/model";
import { cn } from "@/lib/utils";
import { useT } from "./chat-context";
import { FolderMenu, useFolderLabel } from "./folder-menu";
import { useProjectColors } from "./project-colors";

const ICONS: Partial<Record<FolderId, string>> = {
  all: "MessageSquare",
  attention: "BellDot",
  archive: "Archive",
};

function FolderGlyph({ folder, label, selected }: { folder: Folder; label: string; selected: boolean }) {
  const { colorOf } = useProjectColors();
  if (folder.id.startsWith("project:")) {
    const projectId = folder.id.slice("project:".length);
    return (
      <span
        className={cn(
          "grid size-8 place-items-center rounded-[10px] text-[13px] font-semibold text-white",
          selected && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-sidebar",
        )}
        style={{ background: avatarBackground(colorOf(projectId, projectId)) }}
      >
        {initialOf(label)}
      </span>
    );
  }
  const icon = ICONS[folder.id] ?? "Folder";
  return (
    <span
      className={cn(
        "grid size-8 place-items-center rounded-[10px] transition-colors",
        selected ? "bg-foreground text-background" : "bg-sidebar-accent/70 text-muted-foreground group-hover:text-foreground",
      )}
    >
      <Icon name={icon} className="size-4" />
    </span>
  );
}

export function FolderRail({
  folders,
  rows,
  active,
  height,
  onSelect,
  top,
}: {
  folders: readonly Folder[];
  rows: readonly Chat[];
  active: FolderId;
  /** The visible height of bb's scroll area: the rail fills it and scrolls inside. */
  height: number;
  onSelect: (id: FolderId) => void;
  /** Sits above the folders on the search row's level, so both columns start together. */
  top?: ReactNode;
}) {
  const t = useT();
  const label = useFolderLabel();
  const railRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const item = railRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    item?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  return (
    <div
      style={{ height: height > 0 ? `${height}px` : undefined } as CSSProperties}
      className="sticky top-0 flex w-16 shrink-0 flex-col self-start border-r border-sidebar-border"
    >
      {/* Same box as the search row: pt-1, a 28px control, pb-2. */}
      {top !== undefined ? <div className="flex shrink-0 justify-center pb-2 pt-1">{top}</div> : null}
      <nav
        ref={railRef}
        aria-label={t("folder.tabs")}
        className="flex min-h-0 flex-1 flex-col items-stretch gap-0.5 overflow-y-auto overscroll-contain pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {folders.map((folder) => {
          const selected = folder.id === active;
          const name = label(folder);
          return (
            <FolderMenu key={folder.id} folder={folder} rows={rows}>
              <button
                type="button"
                aria-pressed={selected}
                title={name}
                onClick={() => onSelect(folder.id)}
                className="group relative flex cursor-pointer flex-col items-center gap-1 rounded-lg px-1 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="relative">
                  <FolderGlyph folder={folder} label={name} selected={selected} />
                  {folder.badge > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[color:var(--chat-working)] px-1 text-[10px] font-semibold tabular-nums text-white ring-2 ring-sidebar">
                      {folder.badge}
                    </span>
                  ) : null}
                  {folder.lane !== null ? (
                    <span
                      data-lane={folder.lane}
                      aria-hidden="true"
                      className="chat-lane-dot absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-sidebar"
                    />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "w-full truncate text-center text-[10px] leading-3",
                    selected ? "font-medium text-foreground" : "text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  {name}
                </span>
                {folder.lane !== null ? (
                  <span className="sr-only">
                    {`, ${t(folder.lane === "attention" ? "folder.hasWaiting" : "folder.hasWorking")}`}
                  </span>
                ) : null}
              </button>
            </FolderMenu>
          );
        })}
      </nav>
    </div>
  );
}
