// The chat list model: bb threads in messenger order, folders, and search.
//
// One row is one task. With `foldChildren`, sub-agents and forks fold into
// their root and lift its status, so a waiting sub-agent makes the parent
// "needs you" too. Order is Telegram's: pinned on top in bb's manual order,
// then by latest activity.
import type {
  PluginSidebarProject,
  PluginSidebarSection,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";

import { LANE_RANK, laneOf, type Lane } from "./status";

export interface ChatRow {
  thread: PluginSidebarThread;
  project: PluginSidebarProject | null;
  /** The most urgent lane across the row's threads. */
  lane: Lane | null;
  /** Unread in the root or in a folded child. */
  unread: boolean;
  /** Exactly which of the row's threads are unread. */
  unreadIds: string[];
  /** Folded children, most urgent first. */
  children: PluginSidebarThread[];
  /** Folded children that are working or waiting right now. */
  busyChildren: number;
  /** Latest activity across the row — sorts the list and labels the time. */
  activityAt: number;
}

export type FolderId =
  | "all"
  | "attention"
  | "archive"
  | `project:${string}`
  | `section:${string}`;

export interface Folder {
  id: FolderId;
  /** Display name for project and section folders; built-ins are translated by id. */
  name: string | null;
  /** The project is bb's personal one: translate its name. */
  personal: boolean;
  /** Unread chats inside (for Attention: every chat inside). */
  badge: number;
  /** The most urgent status inside, drawn as a dot on the tab. */
  lane: "attention" | "working" | null;
}

export interface BuildOptions {
  lifecycle?: "active" | "archived";
  foldChildren?: boolean;
}

function rootOf(
  thread: PluginSidebarThread,
  byId: ReadonlyMap<string, PluginSidebarThread>,
): PluginSidebarThread {
  let current = thread;
  const seen = new Set([current.id]);
  for (;;) {
    const parentId = current.parentThreadId ?? current.lifecycleOwnerThreadId;
    const parent = parentId === null ? undefined : byId.get(parentId);
    if (parent === undefined || seen.has(parent.id)) return current;
    seen.add(parent.id);
    current = parent;
  }
}

export function pinOrder(a: PluginSidebarThread, b: PluginSidebarThread): number {
  // bb sorts pins with a manual key first, the rest by when they were pinned.
  if (a.pinSortKey !== null && b.pinSortKey !== null) {
    return a.pinSortKey < b.pinSortKey ? -1 : a.pinSortKey > b.pinSortKey ? 1 : 0;
  }
  if (a.pinSortKey !== null) return -1;
  if (b.pinSortKey !== null) return 1;
  return (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0);
}

function urgency(thread: PluginSidebarThread): number {
  const lane = laneOf(thread);
  return lane === null ? 0 : LANE_RANK[lane];
}

export function buildChats(
  threads: readonly PluginSidebarThread[],
  projects: readonly PluginSidebarProject[],
  { lifecycle = "active", foldChildren = true }: BuildOptions = {},
): ChatRow[] {
  const archived = lifecycle === "archived";
  const visible = threads.filter((thread) => !thread.isHidden && thread.isArchived === archived);
  const byId = new Map(visible.map((thread) => [thread.id, thread]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const rows = new Map<string, ChatRow>();

  for (const thread of visible) {
    const root = foldChildren ? rootOf(thread, byId) : thread;
    let row = rows.get(root.id);
    if (row === undefined) {
      row = {
        thread: root,
        project: projectById.get(root.projectId) ?? null,
        lane: null,
        unread: false,
        unreadIds: [],
        children: [],
        busyChildren: 0,
        activityAt: 0,
      };
      rows.set(root.id, row);
    }
    const lane = laneOf(thread);
    if (lane !== null && (row.lane === null || LANE_RANK[lane] > LANE_RANK[row.lane])) row.lane = lane;
    if (thread !== root) {
      row.children.push(thread);
      if (lane === "working" || lane === "attention") row.busyChildren += 1;
    }
    if (thread.isUnread) {
      row.unread = true;
      row.unreadIds.push(thread.id);
    }
    row.activityAt = Math.max(row.activityAt, thread.updatedAt, thread.latestAttentionAt);
  }

  for (const row of rows.values()) {
    row.children.sort((a, b) => urgency(b) - urgency(a) || b.updatedAt - a.updatedAt);
  }

  if (archived) {
    // The archive reads newest-archived first; pins do not matter there.
    return [...rows.values()].sort((a, b) => (b.thread.archivedAt ?? 0) - (a.thread.archivedAt ?? 0));
  }
  return [...rows.values()].sort((a, b) => {
    if (a.thread.isPinned !== b.thread.isPinned) return a.thread.isPinned ? -1 : 1;
    if (a.thread.isPinned) return pinOrder(a.thread, b.thread);
    return b.activityAt - a.activityAt;
  });
}

/** Attention: everything that concerns the user now — waiting, working, or unread. */
export function needsAttention(row: ChatRow): boolean {
  return row.lane === "attention" || row.lane === "working" || row.unread;
}

export function inFolder(row: ChatRow, folder: FolderId): boolean {
  if (folder === "all") return true;
  if (folder === "attention") return needsAttention(row);
  if (folder === "archive") return row.thread.isArchived;
  if (folder.startsWith("project:")) return row.thread.projectId === folder.slice("project:".length);
  return row.thread.sectionId === folder.slice("section:".length);
}

export interface FolderOptions {
  projectTabs: boolean;
  sectionTabs: boolean;
  archiveTab: boolean;
}

/** Projects in the order they are used: the freshest chat comes first. */
export function projectsByUse(
  rows: readonly ChatRow[],
  projects: readonly PluginSidebarProject[],
): PluginSidebarProject[] {
  const lastUse = new Map<string, number>();
  for (const row of rows) {
    lastUse.set(row.thread.projectId, Math.max(lastUse.get(row.thread.projectId) ?? 0, row.activityAt));
  }
  return projects
    .filter((project) => lastUse.has(project.id))
    .sort((a, b) => (lastUse.get(b.id) ?? 0) - (lastUse.get(a.id) ?? 0));
}

export function buildFolders(
  rows: readonly ChatRow[],
  projects: readonly PluginSidebarProject[],
  sections: readonly PluginSidebarSection[],
  options: FolderOptions,
): Folder[] {
  const folder = (id: FolderId, name: string | null = null, personal = false): Folder => {
    const inside = rows.filter((row) => inFolder(row, id));
    return {
      id,
      name,
      personal,
      badge: id === "attention" ? inside.length : inside.filter((row) => row.unread).length,
      lane: inside.some((row) => row.lane === "attention")
        ? "attention"
        : inside.some((row) => row.lane === "working")
          ? "working"
          : null,
    };
  };
  // Attention stays put even when empty, so the tab strip never shifts.
  const folders = [folder("all"), folder("attention")];
  if (options.projectTabs) {
    for (const project of projectsByUse(rows, projects)) {
      folders.push(folder(`project:${project.id}`, project.name, project.isPersonal));
    }
  }
  if (options.sectionTabs) {
    const used = new Set(rows.map((row) => row.thread.sectionId));
    for (const section of sections) {
      if (used.has(section.id)) folders.push(folder(`section:${section.id}`, section.name));
    }
  }
  if (options.archiveTab) folders.push({ id: "archive", name: null, personal: false, badge: 0, lane: null });
  return folders;
}

export interface ProjectGroup {
  /** `pinned` for the pinned block, otherwise the project id (`""` when unknown). */
  key: string;
  project: PluginSidebarProject | null;
  rows: ChatRow[];
}

/**
 * "List headers" mode: pinned chats first as their own block, then one group
 * per project in order of use. Rows keep their order inside a group.
 */
export function groupByProject(
  rows: readonly ChatRow[],
  projects: readonly PluginSidebarProject[],
): ProjectGroup[] {
  const pinned = rows.filter((row) => row.thread.isPinned);
  const rest = rows.filter((row) => !row.thread.isPinned);
  const groups: ProjectGroup[] = [];
  if (pinned.length > 0) groups.push({ key: "pinned", project: null, rows: pinned });
  const byProject = new Map<string, ChatRow[]>();
  for (const row of rest) {
    const list = byProject.get(row.thread.projectId) ?? [];
    list.push(row);
    byProject.set(row.thread.projectId, list);
  }
  for (const project of projectsByUse(rest, projects)) {
    const list = byProject.get(project.id);
    if (list !== undefined) groups.push({ key: project.id, project, rows: list });
    byProject.delete(project.id);
  }
  // Threads whose project bb did not send land in one trailing group.
  const orphans = [...byProject.values()].flat();
  if (orphans.length > 0) groups.push({ key: "", project: null, rows: orphans });
  return groups;
}

/**
 * Neighbours in the global pinned order after moving `dragged` before or after
 * `target` — what `threads.reorderPinned` expects. The order is shared by all
 * folders, so neighbours come from it rather than from the visible list.
 */
export function pinNeighbors(
  pinnedOrder: readonly string[],
  dragged: string,
  target: string,
  place: "before" | "after",
): { previousThreadId: string | null; nextThreadId: string | null; order: string[] } | null {
  if (dragged === target) return null;
  const rest = pinnedOrder.filter((id) => id !== dragged);
  const index = rest.indexOf(target);
  if (index === -1) return null;
  const insertAt = place === "before" ? index : index + 1;
  const order = [...rest.slice(0, insertAt), dragged, ...rest.slice(insertAt)];
  if (order.join() === pinnedOrder.join()) return null;
  return {
    previousThreadId: order[insertAt - 1] ?? null,
    nextThreadId: order[insertAt + 1] ?? null,
    order,
  };
}

/** Every unread thread in a folder — for "Mark all as read". */
export function unreadIdsIn(rows: readonly ChatRow[], folder: FolderId): string[] {
  return rows.filter((row) => inFolder(row, folder)).flatMap((row) => row.unreadIds);
}

/** Case-insensitive match on title, project, branch, and folded children's titles. */
export function matchesQuery(row: ChatRow, needle: string): boolean {
  if (needle === "") return true;
  const haystack = [
    row.thread.displayTitle,
    row.project?.name ?? "",
    row.thread.environment?.branchName ?? "",
    ...row.children.map((child) => child.displayTitle),
  ]
    .join("\n")
    .toLocaleLowerCase();
  return haystack.includes(needle);
}

/** A quiet chat: nothing running, nothing unread, not pinned, and old. */
export function isQuiet(row: ChatRow, cutoff: number): boolean {
  return row.lane === null && !row.unread && !row.thread.isPinned && row.activityAt < cutoff;
}

/** Letter and hue for a row's avatar — stable per project so it is recognisable. */
export function avatarOf(row: ChatRow): { letter: string; hue: number } {
  const name = row.project && !row.project.isPersonal ? row.project.name : row.thread.displayTitle;
  const letter = (name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "•").toLocaleUpperCase();
  const key = row.project?.id ?? row.thread.id;
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { letter, hue: hash % 360 };
}
