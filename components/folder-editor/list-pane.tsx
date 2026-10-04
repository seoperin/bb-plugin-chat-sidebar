// The strip as a list: every folder in order, dragged to reorder, the eye to
// hide, a click to edit; new and ready-made folders below, then history and
// the reset, which asks first.
import { useState } from "react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { Icon } from "@/components/ui/icon";
import { useSortableItem } from "@/hooks/use-sortable";
import {
  customEntry,
  linkedProjectId,
  MAX_CUSTOM_FOLDERS,
  TEMPLATES,
  type FolderEntry,
  type TemplateId,
} from "@/lib/folders";
import type { MessageKey } from "@/lib/i18n";
import { matchesRule, needsAttention, projectsByUse } from "@/lib/model";
import { cn } from "@/lib/utils";
import { useT } from "../chat-context";
import { FolderGlyph } from "../folder-glyph";
import { useFolderLabel } from "../folder-menu";
import { useFolderDnd, useFolders } from "../folders-context";
import { Chip, ConfirmPanel, SectionTitle, TextAction } from "./controls";
import type { EditorData } from "./types";

export function ListPane({
  data,
  selectedId,
  onHistory,
}: {
  data: EditorData;
  /** Highlighted on a wide screen; null on a phone, where picking opens the folder. */
  selectedId: string | null;
  onHistory: () => void;
}) {
  const t = useT();
  const { layout, setLayout, openEditor, updateEntry, customized, reset } = useFolders();
  const dnd = useFolderDnd("vertical");
  const [confirmReset, setConfirmReset] = useState(false);
  const { rows, projects, sections, now } = data;

  const subtitle = (entry: FolderEntry): string => {
    if (entry.hidden) return t("folders.hiddenHint");
    switch (entry.kind) {
      case "all":
        return t("folders.allHint", { count: rows.length });
      case "attention":
        return t("folders.count", { count: rows.filter(needsAttention).length });
      case "archive":
        return t("folders.archiveHint");
      case "projects":
        return t("folders.projectsHint", { count: projectsByUse(rows, projects).length });
      case "sections":
        return t("folders.sectionsHint", {
          count: sections.filter((section) => rows.some((row) => row.thread.sectionId === section.id)).length,
        });
      case "custom": {
        const rule = entry.rule;
        return rule === null
          ? ""
          : t("folders.count", { count: rows.filter((row) => matchesRule(row, rule, now)).length });
      }
    }
  };

  const customCount = layout.entries.filter((entry) => entry.kind === "custom").length;
  const full = customCount >= MAX_CUSTOM_FOLDERS;
  const add = (entry: FolderEntry) => {
    setLayout({ ...layout, entries: [...layout.entries, entry] });
    openEditor(entry.id, { focusName: true });
  };

  return (
    <div className="flex flex-col pb-4">
      <DndContext {...dnd.dndContextProps}>
        <SortableContext
          items={layout.entries.filter((entry) => entry.kind !== "all").map((entry) => entry.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul aria-label={t("folders.title")} className="px-2">
            {layout.entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                selected={entry.id === selectedId}
                subtitle={subtitle(entry)}
                onOpen={() => openEditor(entry.id)}
                onToggleHidden={() => updateEntry(entry.id, { hidden: !entry.hidden })}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="px-2">
        <button
          type="button"
          disabled={full}
          title={full ? t("folders.limit", { count: MAX_CUSTOM_FOLDERS }) : undefined}
          onClick={() => add(customEntry(t("folders.new"), "Folder"))}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg py-1.5 pl-6 pr-1.5 text-left outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-muted text-foreground">
            <Icon name="Plus" className="size-3.5" />
          </span>
          {t("folders.new")}
        </button>
      </div>

      <SectionTitle>{t("folders.ready")}</SectionTitle>
      <div className="flex flex-wrap gap-1.5 px-4">
        {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => {
          const name = t(`folders.template.${id}` as MessageKey);
          return (
            <Chip
              key={id}
              active={false}
              disabled={full}
              onClick={() => add(customEntry(name, TEMPLATES[id].icon, TEMPLATES[id].rule))}
            >
              <Icon name={TEMPLATES[id].icon} className="size-3.5" />
              {name}
            </Chip>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-2 px-2.5">
        <TextAction onClick={onHistory}>
          <Icon name="ClockArrowDown" className="size-3.5" />
          {t("folders.history")}
        </TextAction>
        {customized && !confirmReset ? (
          <TextAction destructive onClick={() => setConfirmReset(true)}>
            <Icon name="RotateCcw" className="size-3.5" />
            {t("folders.reset")}
          </TextAction>
        ) : null}
      </div>
      {confirmReset ? (
        <ConfirmPanel
          className="mx-4 mt-2"
          message={t("folders.resetConfirm", { count: customCount })}
          confirmLabel={t("folders.resetDo")}
          onConfirm={() => {
            setConfirmReset(false);
            reset();
            openEditor(null);
          }}
          onCancel={() => setConfirmReset(false)}
        />
      ) : null}
    </div>
  );
}

/** One folder in the list: dragged to reorder (All stays first), opened on click, hidden with the eye. */
function EntryRow({
  entry,
  selected,
  subtitle,
  onOpen,
  onToggleHidden,
}: {
  entry: FolderEntry;
  selected: boolean;
  subtitle: string;
  onOpen: () => void;
  onToggleHidden: () => void;
}) {
  const t = useT();
  const name = useFolderLabel()(entry);
  const fixed = entry.kind === "all";
  const { setNodeRef, style, handleProps, isDragging } = useSortableItem(entry.id, fixed);
  return (
    <li
      ref={setNodeRef}
      style={style}
      {...(fixed ? {} : handleProps)}
      className={cn(
        "group relative flex touch-manipulation select-none items-center gap-1.5 rounded-lg py-1.5 pl-1 pr-1.5",
        isDragging ? "bg-background shadow-lg ring-1 ring-border" : selected ? "bg-accent" : "hover:bg-accent/60",
      )}
    >
      <span
        aria-hidden="true"
        title={fixed ? t("folders.alwaysFirst") : t("folders.drag")}
        className={cn(
          "grid w-3.5 shrink-0 place-items-center text-muted-foreground/60 transition-opacity",
          fixed ? "invisible" : "cursor-grab opacity-0 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100",
        )}
      >
        <Icon name="DragDropVertical" className="size-3.5" />
      </span>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onOpen}
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
          entry.hidden && "opacity-50",
        )}
      >
        <FolderGlyph
          kind={entry.kind}
          icon={entry.icon}
          color={entry.color}
          colorProjectId={linkedProjectId(entry)}
          label={name}
          size="sm"
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{name}</span>
          <span className="truncate text-[11px] text-muted-foreground">{subtitle}</span>
        </span>
      </button>
      {fixed ? null : (
        <button
          type="button"
          aria-label={t(entry.hidden ? "folders.show" : "folders.hide", { name })}
          title={t(entry.hidden ? "folders.show" : "folders.hide", { name })}
          onClick={onToggleHidden}
          className={cn(
            "grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            // Shown while it says "hidden"; otherwise on hover, and always on touch.
            !entry.hidden &&
              "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100",
          )}
        >
          <Icon name={entry.hidden ? "EyeOff" : "Eye"} className="size-3.5" />
        </button>
      )}
    </li>
  );
}
