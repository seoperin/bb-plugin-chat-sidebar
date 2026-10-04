// The layouts recent saves replaced, one row per change: when it happened,
// what it did, and Restore, which brings back the folders as they were just
// before it. Restoring asks first; the folders it replaces go into the
// history in turn, so a restore can be undone too.
import { useEffect, useState } from "react";

import { describeChange, type FolderChange } from "@/lib/folder-history";
import type { HistoryEntry } from "@/lib/folder-store";
import { cn } from "@/lib/utils";
import { useChat } from "../chat-context";
import { useFolderLabel } from "../folder-menu";
import { useFolders } from "../folders-context";
import { ConfirmPanel, TextAction } from "./controls";

export function HistoryPane({ onDone }: { onDone: () => void }) {
  const { i18n } = useChat();
  const { t } = i18n;
  const label = useFolderLabel();
  const { loadHistory, restore, layout, customized } = useFolders();
  const current = customized ? layout : null;
  const [items, setItems] = useState<HistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    loadHistory().then(
      (list) => alive && setItems(list),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [loadHistory]);

  const when = (at: number) =>
    new Intl.DateTimeFormat(i18n.locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(
      at,
    );
  const phrase = (change: FolderChange): string => {
    switch (change.kind) {
      case "reset":
        return t("folders.change.reset");
      case "arranged":
        return t("folders.change.arranged");
      case "moved":
        return t("folders.change.moved");
      case "renamed":
        return t("folders.change.renamed", { from: label(change.from), name: label(change.entry) });
      default:
        return t(`folders.change.${change.kind}`, { name: label(change.entry) });
    }
  };
  /** The change that replaced `items[index]`: against the next newer layout, or the current one. */
  const summary = (index: number): string => {
    const item = items?.[index];
    if (item === undefined) return "";
    const after = index === 0 ? current : (items?.[index - 1]?.layout ?? null);
    const changes = describeChange(item.layout, after);
    if (changes.length === 0) return t("folders.change.none");
    const shown = changes.slice(0, 2).map(phrase).join(" · ");
    return changes.length > 2 ? `${shown} · ${t("folders.change.more", { count: changes.length - 2 })}` : shown;
  };

  return (
    <div className="px-4 pb-4 pt-4">
      <p className="text-xs leading-relaxed text-muted-foreground">{t("folders.historyAbout")}</p>
      {failed ? (
        <p className="pt-4 text-xs text-destructive">{t("folders.historyFailed")}</p>
      ) : items === null ? (
        <p className="pt-4 text-xs text-muted-foreground">{t("list.loading")}</p>
      ) : items.length === 0 ? (
        <p className="pt-4 text-xs text-muted-foreground">{t("folders.historyEmpty")}</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {items.map((item, index) => (
            <li key={item.revision}>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-2",
                  confirming === item.revision ? "bg-accent/60" : "hover:bg-accent/60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">{when(item.replacedAt)}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{summary(index)}</span>
                </span>
                {confirming === item.revision ? null : (
                  <button
                    type="button"
                    onClick={() => setConfirming(item.revision)}
                    className="h-7 shrink-0 cursor-pointer rounded-md border border-border px-2.5 text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t("folders.restore")}
                  </button>
                )}
              </div>
              {confirming === item.revision ? (
                <ConfirmPanel
                  className="mt-1"
                  message={t("folders.restoreConfirm", { time: when(item.replacedAt) })}
                  confirmLabel={t("folders.restore")}
                  onConfirm={() => {
                    setConfirming(null);
                    restore(item.revision);
                    onDone();
                  }}
                  onCancel={() => setConfirming(null)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 -ml-1.5">
        <TextAction onClick={onDone}>{t("folders.backToFolders")}</TextAction>
      </div>
    </div>
  );
}
