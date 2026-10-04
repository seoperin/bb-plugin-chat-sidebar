// What one saved change did to the folders, so a history row can say it in
// words ("Renamed “A” → “B”", "Order changed") instead of listing folders
// that look the same in every row.
import type { FolderEntry, FolderLayout } from "./folders";

export type FolderChange =
  | { kind: "reset" }
  | { kind: "arranged" }
  | { kind: "added" | "removed" | "hidden" | "shown" | "edited"; entry: FolderEntry }
  | { kind: "renamed"; entry: FolderEntry; from: FolderEntry }
  | { kind: "moved" };

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The changes that turned `before` into `after`, most telling first. A null
 * layout is the default folders: going to it is a reset, leaving it is the
 * first arrangement.
 */
export function describeChange(before: FolderLayout | null, after: FolderLayout | null): FolderChange[] {
  if (after === null) return before === null ? [] : [{ kind: "reset" }];
  if (before === null) return [{ kind: "arranged" }];

  const old = new Map(before.entries.map((entry) => [entry.id, entry]));
  const now = new Map(after.entries.map((entry) => [entry.id, entry]));
  const changes: FolderChange[] = [];

  for (const entry of after.entries) {
    const was = old.get(entry.id);
    if (was === undefined) {
      changes.push({ kind: "added", entry });
      continue;
    }
    if (was.name !== entry.name) changes.push({ kind: "renamed", entry, from: was });
    if (was.hidden !== entry.hidden) changes.push({ kind: entry.hidden ? "hidden" : "shown", entry });
    if (was.icon !== entry.icon || was.color !== entry.color || !same(was.rule, entry.rule)) {
      changes.push({ kind: "edited", entry });
    }
  }
  for (const entry of before.entries) {
    if (!now.has(entry.id)) changes.push({ kind: "removed", entry });
  }

  // Order counts only among folders both layouts have.
  const order = (layout: FolderLayout, keep: Map<string, FolderEntry>) =>
    layout.entries.filter((entry) => keep.has(entry.id)).map((entry) => entry.id);
  if (!same(order(before, now), order(after, old))) changes.push({ kind: "moved" });

  return changes;
}
