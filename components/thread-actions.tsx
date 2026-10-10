// The list's part in bb's thread action registry (bb 0.46+).
//
// bb draws every thread menu (the thread header's, a row's right-click menu,
// the long-press drawer on phones) from one registry, and this plugin adds to
// it in two ways:
//
// - "Add to folder" is a registration, so it also shows in the thread
//   header's menu. Registrations run outside the list, so the list publishes
//   what the action needs (folders, rows, the editor) to a small store here
//   while it is mounted; with the list closed the action hides.
// - The rest of the row menu's own items (sub-agents, a project's colour, a
//   new chat in the project, reading a folded row) belong to the list alone
//   and go in as inline items of its menu.
//
// Icons in bb's menus are names, so the colour dots and status dots the old
// menu drew are registered as icons under this plugin's namespace.
import { useSyncExternalStore } from "react";
import {
  experimental_THREAD_ACTION_GROUPS as GROUPS,
  type PluginAppBuilder,
  type PluginSidebarThread,
  type PluginThreadActionRegistration,
  type PluginThreadActionTarget,
} from "@get-bb/plugin-sdk/app";

import { customEntry, hasFilters, MAX_CUSTOM_FOLDERS, type FolderEntry, type FolderLayout, type FolderRule } from "@/lib/folders";
import type { Translator } from "@/lib/i18n";
import { matchesRule, type Chat } from "@/lib/model";
import { PALETTE, swatch, type ColorId } from "@/lib/colors";
import type { Lane } from "@/lib/status";

/** The fields bb's own actions read, from a sidebar thread. */
export function toActionTarget(thread: PluginSidebarThread): PluginThreadActionTarget {
  return {
    id: thread.id,
    projectId: thread.projectId,
    parentThreadId: thread.parentThreadId,
    archivedAt: thread.archivedAt,
    pinnedAt: thread.pinnedAt,
    sectionId: thread.sectionId,
    isUnread: thread.isUnread,
    status: thread.status,
    environment:
      thread.environment?.id == null ? null : { id: thread.environment.id, path: thread.environment.path },
  };
}

const NS = "chat-sidebar";
export const swatchIcon = (color: ColorId) => `${NS}/swatch-${color}`;
export const laneIcon = (lane: Lane | null) => `${NS}/lane-${lane ?? "none"}`;

const LANE_COLORS: Record<Lane | "none", string> = {
  attention: "#e8a317",
  working: "#3987e5",
  done: "#1f9d55",
  none: "color-mix(in srgb, currentColor 35%, transparent)",
};

function dot(color: string, size: number) {
  return function Dot({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
        <circle cx="8" cy="8" r={size} fill={color} />
      </svg>
    );
  };
}

export function registerMenuIcons(app: PluginAppBuilder): void {
  for (const color of PALETTE) {
    app.experimental_icons.register({ name: swatchIcon(color.id), component: dot(swatch(color), 6) });
  }
  for (const [lane, color] of Object.entries(LANE_COLORS)) {
    app.experimental_icons.register({ name: `${NS}/lane-${lane}`, component: dot(color, 3.5) });
  }
}

/**
 * Put a chat in a custom folder or take it out. Taking out a chat that the
 * folder's filters pick excludes it by hand, the way Telegram does.
 */
export function withChat(rule: FolderRule, row: Chat, include: boolean): FolderRule {
  const id = row.thread.id;
  const chats = rule.chats.filter((chat) => chat !== id);
  const excludeChats = rule.excludeChats.filter((chat) => chat !== id);
  if (include) return { ...rule, chats: [...chats, id], excludeChats };
  const stillPicked = hasFilters(rule) && matchesRule(row, { ...rule, chats, excludeChats }, Date.now());
  return { ...rule, chats, excludeChats: stillPicked ? [...excludeChats, id] : excludeChats };
}

/** What the mounted list lends the "Add to folder" registration. */
export interface FolderBridge {
  t: Translator["t"];
  layout: FolderLayout;
  /** The row a thread shows in: its own, or its parent's when folded. */
  rowOf(threadId: string): Chat | undefined;
  label(entry: FolderEntry): string;
  updateEntry(id: string, patch: Partial<FolderEntry>): void;
  setLayout(next: FolderLayout): void;
  openEditor(entryId: string, options: { focusName: boolean }): void;
}

let bridge: FolderBridge | null = null;
const listeners = new Set<() => void>();

export function publishFolderBridge(next: FolderBridge | null): void {
  bridge = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

const NEW_FOLDER = "__new__";

export const addToFolderAction: PluginThreadActionRegistration<FolderBridge | null> = {
  id: "add-to-folder",
  title: "Add to folder",
  icon: "FolderPlus",
  group: GROUPS.organize,
  order: 90,
  useData: () => useSyncExternalStore(subscribe, () => bridge),
  item: ({ thread, data }) => {
    if (data === null || thread.archivedAt !== null) return null;
    const row = data.rowOf(thread.id);
    if (row === undefined) return null;
    const { t } = data;
    const now = Date.now();
    const custom = data.layout.entries.filter((entry) => entry.kind === "custom" && entry.rule !== null);
    return {
      label: t("menu.addToFolder"),
      icon: "FolderPlus",
      choices: {
        items: [
          ...custom.map((entry) => ({
            id: entry.id,
            label: data.label(entry),
            icon: entry.icon ?? "Folder",
            selected: matchesRule(row, entry.rule!, now),
          })),
          {
            id: NEW_FOLDER,
            label: t("menu.newFolderWith"),
            icon: "Plus",
            disabled: custom.length >= MAX_CUSTOM_FOLDERS,
          },
        ],
      },
      run: ({ value }) => {
        if (value === NEW_FOLDER) {
          const entry = customEntry(t("folders.new"), "Folder", { chats: [row.thread.id] });
          data.setLayout({ ...data.layout, entries: [...data.layout.entries, entry] });
          data.openEditor(entry.id, { focusName: true });
          return;
        }
        const entry = custom.find((candidate) => candidate.id === value);
        if (entry === undefined) return;
        data.updateEntry(entry.id, { rule: withChat(entry.rule!, row, !matchesRule(row, entry.rule!, Date.now())) });
      },
    };
  },
};
