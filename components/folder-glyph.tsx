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
  ring = true,
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
  /** Mark the selection with a ring. */
  ring?: boolean;
  /** "lg" is the icons-only rail's: a 40px square that rounds less when selected or hovered, as in Discord. */
  size?: "lg" | "md" | "sm";
}) {
  const { colorOf } = useProjectColors();
  const box =
    size === "lg"
      ? cn("size-10 transition-[border-radius] duration-150", selected ? "rounded-[12px]" : "rounded-[15px] group-hover:rounded-[12px]")
      : size === "md"
        ? "size-8 rounded-[10px]"
        : "size-6 rounded-[7px]";
  const selectedRing = selected && ring && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-sidebar";
  if (projectId !== null) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center font-semibold text-white",
          box,
          size === "lg" ? "text-[15px]" : size === "md" ? "text-[13px]" : "text-[11px]",
          selectedRing,
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
          ? cn("text-white", selectedRing)
          : selected
            ? "bg-foreground text-background"
            : "bg-sidebar-accent/70 text-muted-foreground group-hover:text-foreground",
      )}
      style={fill !== null ? { background: avatarBackground(fill) } : undefined}
    >
      <Icon name={name} className={size === "lg" ? "size-5" : size === "md" ? "size-4" : "size-3.5"} />
    </span>
  );
}
