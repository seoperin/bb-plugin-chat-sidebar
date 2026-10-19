// One folder: what it is, its name, colour and icon, and for a custom folder
// its rule. Deleting asks first.
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { linkedProjectId, MAX_NAME, type FolderEntry } from "@/lib/folders";
import type { MessageKey } from "@/lib/i18n";
import { entryFolderId } from "@/lib/folder-images";
import { useT } from "../chat-context";
import { FolderGlyph } from "../folder-glyph";
import { useFolderImages } from "../folder-images";
import { useFolderLabel } from "../folder-menu";
import { useFolders } from "../folders-context";
import { ConfirmPanel, DebouncedInput, SectionTitle } from "./controls";
import { FolderColor, IconPicker } from "./pickers";
import { RuleEditor } from "./rule-editor";
import type { EditorData } from "./types";

const ABOUT: Partial<Record<FolderEntry["kind"], MessageKey>> = {
  all: "folders.about.all",
  attention: "folders.about.attention",
  archive: "folders.about.archive",
  projects: "folders.about.projects",
  sections: "folders.about.sections",
};

export function EntryPane({
  entry,
  data,
  showHeader,
}: {
  entry: FolderEntry;
  data: EditorData;
  /** False on a phone, where the dialog's title already names the folder. */
  showHeader: boolean;
}) {
  const t = useT();
  const label = useFolderLabel();
  const { updateEntry, deleteEntry, openEditor, editing } = useFolders();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { imageOf, pickImage, removeImage } = useFolderImages();
  const name = label(entry);
  const folderId = entryFolderId(entry);
  const about = ABOUT[entry.kind];
  // Per-project and per-section folders take their names from bb.
  const generated = entry.kind === "projects" || entry.kind === "sections";

  return (
    <div>
      {showHeader ? (
        <div className="flex items-center gap-2.5 px-4 pt-4">
          <FolderGlyph
            kind={entry.kind}
            icon={entry.icon}
            color={entry.color}
            folderId={entryFolderId(entry)}
            colorProjectId={linkedProjectId(entry)}
            label={name}
          />
          <span className="truncate text-sm font-medium">{name}</span>
        </div>
      ) : null}
      {about !== undefined ? (
        <p className="px-4 pt-2 text-xs leading-relaxed text-muted-foreground">{t(about)}</p>
      ) : null}

      {generated ? null : (
        <>
          <SectionTitle>{t("folders.name")}</SectionTitle>
          <div className="px-4">
            <DebouncedInput
              label={t("folders.name")}
              value={entry.name ?? ""}
              maxLength={MAX_NAME}
              autoFocus={editing?.focusName === true}
              placeholder={label({ kind: entry.kind, name: null })}
              onCommit={(next) => updateEntry(entry.id, { name: next.trim() === "" ? null : next.trim() })}
            />
          </div>
        </>
      )}

      {/* Project folders draw each project's own avatar and colour. */}
      {entry.kind === "projects" ? null : (
        <>
          <SectionTitle>{t("folders.color")}</SectionTitle>
          <FolderColor entry={entry} projects={data.projects} />
          <SectionTitle>{t("folders.icon")}</SectionTitle>
          <IconPicker value={entry.icon} kind={entry.kind} onChange={(icon) => updateEntry(entry.id, { icon })} />
        </>
      )}

      {folderId !== null ? (
        <>
          <SectionTitle>{t("image.section")}</SectionTitle>
          <p className="px-4 pb-2 text-[11px] text-muted-foreground">{t("image.about")}</p>
          <div className="flex gap-2 px-4">
            <button
              type="button"
              onClick={() => pickImage(folderId, name)}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon name="chat-sidebar/camera" className="size-3.5" />
              {t("image.choose")}
            </button>
            {imageOf(folderId) !== null ? (
              <button
                type="button"
                onClick={() => removeImage(folderId)}
                className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("image.remove")}
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {entry.kind === "custom" && entry.rule !== null ? (
        <RuleEditor rule={entry.rule} onChange={(rule) => updateEntry(entry.id, { rule })} data={data} />
      ) : null}

      {entry.kind === "custom" ? (
        <div className="px-4 pb-2 pt-6">
          {confirmDelete ? (
            <ConfirmPanel
              message={t("folders.deleteConfirm", { name })}
              confirmLabel={t("folders.delete")}
              onConfirm={() => {
                setConfirmDelete(false);
                deleteEntry(entry.id, name);
                openEditor(null);
              }}
              onCancel={() => setConfirmDelete(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon name="Trash2" className="size-3.5" />
              {t("folders.delete")}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
