// The folder editor, in a dialog over the app so the sidebar stays in view
// and every change shows in it at once.
//
// On a wide screen it has two columns, like Telegram Desktop's folder
// settings: the strip on the left, the chosen folder (or the history) on the
// right. On a phone the dialog is bb's bottom sheet and the columns become
// steps, with a back link in the header.
//
// Changes save as they are made. Deleting a folder, resetting and restoring
// an old layout ask first; deleting and resetting can also be undone from
// the toast, and the history keeps the last layouts.
import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsCompactViewport } from "@/components/ui/hooks/use-compact-viewport";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useT } from "../chat-context";
import { useFolderLabel } from "../folder-menu";
import { useFolders } from "../folders-context";
import { EntryPane } from "./entry-pane";
import { HistoryPane } from "./history-pane";
import { ListPane } from "./list-pane";
import type { EditorData } from "./types";

export function FolderEditor(data: EditorData) {
  const t = useT();
  const label = useFolderLabel();
  const { editing, closeEditor, openEditor, layout } = useFolders();
  const compact = useIsCompactViewport();
  const [view, setView] = useState<"folders" | "history">("folders");
  const open = editing !== null;
  useEffect(() => {
    if (!open) setView("folders");
  }, [open]);

  // A wide dialog always shows a folder on the right; a phone starts on the list.
  const selectedId = editing?.entryId ?? (compact ? null : (layout.entries[0]?.id ?? null));
  const entry = selectedId === null ? null : (layout.entries.find((candidate) => candidate.id === selectedId) ?? null);
  const history = view === "history";

  const list = <ListPane data={data} selectedId={compact ? null : selectedId} onHistory={() => setView("history")} />;
  const detail = history ? (
    <HistoryPane onDone={() => setView("folders")} />
  ) : entry === null ? (
    <p className="p-6 text-sm text-muted-foreground">{t("folders.pick")}</p>
  ) : (
    <EntryPane key={entry.id} entry={entry} data={data} showHeader={!compact} />
  );

  // On a phone the title follows the step; on a wide screen it is always "Folders".
  const title =
    compact && history ? t("folders.history") : compact && entry !== null ? label(entry) : t("folders.title");
  const back = compact && (history || entry !== null);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : closeEditor())}>
      <DialogContent
        data-chat-folders-editor=""
        // Escape inside a confirmation cancels the confirmation, not the editor.
        onEscapeKeyDown={(event) => {
          if (document.activeElement?.closest('[role="alertdialog"]')) event.preventDefault();
        }}
        className={cn(
          "text-[13px]",
          compact
            ? "gap-0 px-0 pb-4 pt-0"
            : "flex h-[min(680px,86vh)] max-w-[780px] flex-col gap-0 overflow-hidden p-0",
        )}
      >
        <DialogHeader className={cn("border-b border-border", compact ? "px-4 pb-3" : "px-5 pb-3 pt-4")}>
          {back ? (
            <button
              type="button"
              onClick={() => (history ? setView("folders") : openEditor(null))}
              className="-ml-1 mb-1 flex w-fit cursor-pointer items-center gap-0.5 rounded-md pr-1.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon name="ChevronLeft" className="size-3.5" />
              {t("folders.title")}
            </button>
          ) : null}
          <DialogTitle className="truncate text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs">{t("folders.saved")}</DialogDescription>
        </DialogHeader>
        {compact ? (
          <div className="pt-1">{history || entry !== null ? detail : list}</div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[264px_minmax(0,1fr)]">
            <div className="min-h-0 overflow-y-auto border-r border-border pt-2">{list}</div>
            <div className="min-h-0 overflow-y-auto pb-4">{detail}</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
