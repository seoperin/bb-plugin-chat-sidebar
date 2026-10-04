// A folder's colour and icon.
import type { PluginSidebarProject } from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import { PALETTE, swatch, type ColorId } from "@/lib/colors";
import { DEFAULT_ICONS, FOLDER_ICONS, linkedProjectId, type FolderEntry } from "@/lib/folders";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useT } from "../chat-context";
import { useFolders } from "../folders-context";
import { useProjectColors } from "../project-colors";

const SELECTED_RING = "ring-2 ring-foreground/70 ring-offset-2 ring-offset-background";

/**
 * A folder about one project wears that project's colour, so picking a colour
 * there picks the project's — its chats' avatars change with it. Any other
 * folder keeps a colour of its own.
 */
export function FolderColor({ entry, projects }: { entry: FolderEntry; projects: readonly PluginSidebarProject[] }) {
  const t = useT();
  const { updateEntry } = useFolders();
  const { pickOf, setColor } = useProjectColors();
  const projectId = linkedProjectId(entry);
  if (projectId === null) {
    return <ColorPicker value={entry.color} onChange={(color) => updateEntry(entry.id, { color })} />;
  }
  const project = projects.find((candidate) => candidate.id === projectId);
  const name = project === undefined ? "" : project.isPersonal ? t("folder.personal") : project.name;
  return (
    <>
      <ColorPicker
        value={pickOf(projectId)}
        noneLabel={t("folders.colorAuto")}
        onChange={(color) => {
          setColor(projectId, color);
          // A colour the folder kept before it was tied to the project would only confuse.
          if (entry.color !== null) updateEntry(entry.id, { color: null });
        }}
      />
      <p className="px-4 pt-2 text-[11px] text-muted-foreground">{t("folders.colorLinked", { name })}</p>
    </>
  );
}

function ColorPicker({
  value,
  onChange,
  noneLabel,
}: {
  value: ColorId | null;
  onChange: (color: ColorId | null) => void;
  /** What "no pick" means here; "No colour" unless said otherwise. */
  noneLabel?: string;
}) {
  const t = useT();
  const none = noneLabel ?? t("folders.colorNone");
  return (
    <div role="radiogroup" aria-label={t("folders.color")} className="flex flex-wrap items-center gap-1.5 px-4">
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        title={none}
        aria-label={none}
        onClick={() => onChange(null)}
        className={cn(
          "grid size-[22px] cursor-pointer place-items-center rounded-full border border-border text-muted-foreground",
          value === null && SELECTED_RING,
        )}
      >
        <Icon name="Unavailable" className="size-3.5" />
      </button>
      {PALETTE.map((color) => {
        const name = t(`color.${color.id}` as MessageKey);
        return (
          <button
            key={color.id}
            type="button"
            role="radio"
            aria-checked={value === color.id}
            title={name}
            aria-label={name}
            onClick={() => onChange(color.id)}
            className={cn("size-[22px] cursor-pointer rounded-full", value === color.id && SELECTED_RING)}
            style={{ background: swatch(color) }}
          />
        );
      })}
    </div>
  );
}

export function IconPicker({
  value,
  kind,
  onChange,
}: {
  value: string | null;
  kind: FolderEntry["kind"];
  onChange: (icon: string | null) => void;
}) {
  const t = useT();
  const shown = value ?? DEFAULT_ICONS[kind];
  return (
    <div
      role="radiogroup"
      aria-label={t("folders.icon")}
      className="grid grid-cols-[repeat(auto-fill,minmax(32px,1fr))] gap-1 px-4"
    >
      {FOLDER_ICONS.map((icon) => {
        const selected = shown === icon;
        const name = icon.replace(/^chat-sidebar\//, "");
        return (
          <button
            key={icon}
            type="button"
            role="radio"
            aria-checked={selected}
            title={name}
            aria-label={name}
            // The default icon stays stored as "no choice", so it follows bb.
            onClick={() => onChange(icon === DEFAULT_ICONS[kind] ? null : icon)}
            className={cn(
              "grid aspect-square cursor-pointer place-items-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
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
  );
}
