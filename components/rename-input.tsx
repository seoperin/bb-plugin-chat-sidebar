// Rename in place: a field instead of the title. Enter or blur saves, Esc
// cancels; an empty or unchanged title is not saved. bb saves silently
// (`actions.rename`), without a dialog.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  experimental_useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";

import { cn } from "@/lib/utils";
import { useT } from "./chat-context";

export function RenameInput({
  thread,
  onDone,
  className,
}: {
  thread: PluginSidebarThread;
  onDone: () => void;
  className?: string;
}) {
  const t = useT();
  const actions = experimental_useSidebarThreadActions();
  const initial = thread.title ?? thread.displayTitle;
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    // A closing context menu hands focus back to its trigger; take it after.
    const timer = setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const next = value.trim();
    onDone();
    if (!save || next === "" || next === initial) return;
    actions.rename(thread.id, next).catch((cause: unknown) => {
      toast.error(t("toast.renameFailed"), {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    });
  };

  return (
    <input
      ref={ref}
      value={value}
      aria-label={t("rename.label")}
      maxLength={200}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(true);
        if (event.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
      className={cn(
        "min-w-0 flex-1 rounded-md border border-ring bg-background px-1.5 py-0.5 text-[13px] text-foreground outline-none",
        className,
      )}
    />
  );
}
