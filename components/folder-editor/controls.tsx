// The small controls the folder editor is built from.
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useT } from "../chat-context";

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="px-4 pb-1.5 pt-5 text-xs font-medium text-foreground/80">{children}</div>;
}

/** A labelled row of chips (or anything else) inside a section. */
export function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-4 pt-3">
      <div className="pb-1.5 text-xs text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function Chip({
  active,
  onClick,
  disabled = false,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-7 max-w-full cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50",
        active
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground enabled:hover:bg-accent enabled:hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** A quiet text action, with a destructive variant that only turns red on hover. */
export function TextAction({
  onClick,
  destructive = false,
  children,
}: {
  onClick: () => void;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        destructive ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * The confirmation every destructive action goes through, shown in place of
 * the button that asked. Cancel has the focus, so Enter does no harm; Escape
 * cancels too.
 */
export function ConfirmPanel({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  className,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
}) {
  const t = useT();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);
  return (
    <div
      role="alertdialog"
      aria-label={message}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // Close this, not the dialog around it.
        event.stopPropagation();
        onCancel();
      }}
      className={cn("rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs", className)}
    >
      <p className="leading-relaxed text-foreground">{message}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="h-7 cursor-pointer rounded-md bg-destructive px-3 font-medium text-white outline-none hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {confirmLabel}
        </button>
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          className="h-7 cursor-pointer rounded-md px-3 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("folders.cancel")}
        </button>
      </div>
    </div>
  );
}

/** Spaces around the text are not saved, so they are no change. */
const same = (draft: string, value: string) => draft.trim() === value.trim();

/**
 * A text field that saves after a pause rather than on every key, and saves
 * whatever is left when it goes away (the dialog closed, another folder picked).
 */
export function DebouncedInput({
  value,
  onCommit,
  placeholder,
  maxLength,
  label,
  autoFocus = false,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
  label: string;
  /** Focus and select the text, for a folder that was just made. */
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const latest = useRef({ draft, value });
  latest.current = { draft, value };
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  useEffect(() => {
    if (same(draft, latest.current.value)) return;
    const timer = setTimeout(() => commitRef.current(draft), 500);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(
    () => () => {
      if (!same(latest.current.draft, latest.current.value)) commitRef.current(latest.current.draft);
    },
    [],
  );

  return (
    <input
      aria-label={label}
      value={draft}
      maxLength={maxLength}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onFocus={(event) => {
        focused.current = true;
        if (autoFocus) event.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        if (!same(draft, value)) commitRef.current(draft);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
    />
  );
}

export function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((value) => value !== item) : [...list, item];
}
