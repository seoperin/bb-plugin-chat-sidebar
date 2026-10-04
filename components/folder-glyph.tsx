// A folder's square glyph: the project's avatar for a project folder, else
// the folder's icon — on its project's colour when it is about one project,
// on its own colour when it has one.
import { Icon } from "@/components/ui/icon";
import { avatarBackground, colorById, type ColorId } from "@/lib/colors";
import { DEFAULT_ICONS, type EntryKind } from "@/lib/folders";
import { initialOf } from "@/lib/model";
import { cn } from "@/lib/utils";
import { useProjectColors } from "./project-colors";

export function FolderGlyph({
  kind,
  icon,
  color,
  projectId = null,
  colorProjectId = null,
  label,
  selected = false,
  size = "md",
}: {
  kind: EntryKind;
  icon: string | null;
  color: ColorId | null;
  /** Draw this project's avatar instead of an icon. */
  projectId?: string | null;
  /** Fill with this project's colour, whatever `color` says. */
  colorProjectId?: string | null;
  label: string;
  selected?: boolean;
  size?: "md" | "sm";
}) {
  const { colorOf } = useProjectColors();
  const box = size === "md" ? "size-8 rounded-[10px]" : "size-6 rounded-[7px]";
  if (projectId !== null) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center font-semibold text-white",
          box,
          size === "md" ? "text-[13px]" : "text-[11px]",
          selected && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-sidebar",
        )}
        style={{ background: avatarBackground(colorOf(projectId, projectId)) }}
      >
        {initialOf(label)}
      </span>
    );
  }
  const name = icon ?? DEFAULT_ICONS[kind];
  const fill =
    colorProjectId !== null ? colorOf(colorProjectId, colorProjectId) : color !== null ? colorById(color) : null;
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center transition-colors",
        box,
        fill !== null
          ? cn("text-white", selected && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-sidebar")
          : selected
            ? "bg-foreground text-background"
            : "bg-sidebar-accent/70 text-muted-foreground group-hover:text-foreground",
      )}
      style={fill !== null ? { background: avatarBackground(fill) } : undefined}
    >
      <Icon name={name} className={size === "md" ? "size-4" : "size-3.5"} />
    </span>
  );
}
