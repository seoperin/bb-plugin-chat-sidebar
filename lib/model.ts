// The chat list model: bb threads in messenger order, folders, and search.
//
// One row is one task. With `foldChildren`, sub-agents and forks fold into
// their root and lift its status, so a waiting sub-agent makes the parent
// "needs you" too. Order is Telegram's: pinned on top in bb's manual order,
// then by latest activity.
import type { PluginSidebarProject, PluginSidebarSection, PluginSidebarThread } from "@get-bb/plugin-sdk/app";

import type { ColorId } from "./colors";
import { hasFilters, linkedProjectId, type EntryKind, type FolderLayout, type FolderRule } from "./folders";
import { LANE_RANK, laneOf, type Lane } from "./status";

export interface Chat {
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

/** `all`, `attention`, `archive`, `project:<id>`, `section:<id>` or `custom:<id>`. */
export type FolderId = string;

export interface Folder {
  id: FolderId;
  /** The layout entry it comes from; a project or section folder shares its generator's. */
  entryId: string;
  kind: EntryKind;
  /** The user's name, or the project's or section's; null translates the built-in name. */
  name: string | null;
  /** The project is bb's personal one: translate its name. */
  personal: boolean;
  /** A bb icon name; null for project folders, which draw their avatar. */
  icon: string | null;
  color: ColorId | null;
  /** A custom folder about one project: it wears that project's colour. */
  linkedProjectId: string | null;
  /** Unread chats inside (for Attention: every chat inside). */
  badge: number;
  /** The most urgent status inside, drawn as a dot on the tab. */
  lane: "attention" | "working" | null;
  /** Whether a chat belongs here. */
  matches: (row: Chat) => boolean;
  /** Where "+" starts a chat from this folder; null opens bb's New thread as is. */
  startIn: { projectId?: string; sectionId?: string } | null;
}

export interface BuildOptions {
  lifecycle?: "active" | "archived";
  foldChildren?: boolean;
}

function rootOf(thread: PluginSidebarThread, byId: ReadonlyMap<string, PluginSidebarThread>): PluginSidebarThread {
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
): Chat[] {
  const archived = lifecycle === "archived";
  const visible = threads.filter((thread) => !thread.isHidden && thread.isArchived === archived);
  const byId = new Map(visible.map((thread) => [thread.id, thread]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const rows = new Map<string, Chat>();

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

/** The most urgent live status among chats, for a folder's or heading's dot. */
export function mostUrgentLane(chats: readonly Chat[]): "attention" | "working" | null {
  if (chats.some((chat) => chat.lane === "attention")) return "attention";
  if (chats.some((chat) => chat.lane === "working")) return "working";
  return null;
}

/** Attention: everything that concerns the user now — waiting, working, or unread. */
export function needsAttention(row: Chat): boolean {
  return row.lane === "attention" || row.lane === "working" || row.unread;
}

const MINUTE = 60_000;

function rowThreads(row: Chat): PluginSidebarThread[] {
  return [row.thread, ...row.children];
}

function failed(thread: PluginSidebarThread): boolean {
  return thread.status === "error" || thread.indicator === "unread-error" || thread.queuedWork === "failed";
}

function waiting(thread: PluginSidebarThread): boolean {
  return thread.hasPendingInteraction || thread.indicator === "waiting-for-input";
}

function startOfToday(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** A custom folder's rule against one chat. */
export function matchesRule(row: Chat, rule: FolderRule, now: number): boolean {
  const { id } = row.thread;
  if (rule.excludeChats.includes(id)) return false;
  if (rule.chats.includes(id)) return true;
  if (!hasFilters(rule)) return false;
  const threads = rowThreads(row);
  if (rule.statuses.length > 0) {
    const ok = rule.statuses.some((status) => {
      switch (status) {
        case "waiting":
          return threads.some(waiting);
        case "failed":
          return threads.some(failed);
        case "working":
          return row.lane === "working" || row.busyChildren > 0;
        case "unread":
          return row.unread;
        case "pinned":
          return row.thread.isPinned;
      }
    });
    if (!ok) return false;
  }
  if (rule.projects.length > 0 && !rule.projects.includes(row.thread.projectId)) return false;
  if (rule.sections.length > 0 && (row.thread.sectionId === null || !rule.sections.includes(row.thread.sectionId))) {
    return false;
  }
  if (rule.providers.length > 0 && !threads.some((thread) => rule.providers.includes(thread.providerId))) return false;
  if (rule.text.trim() !== "" && !matchesQuery(row, rule.text.trim().toLocaleLowerCase())) return false;
  if (rule.waitingMinutes > 0) {
    const since = Math.max(0, ...threads.filter(waiting).map((thread) => thread.latestAttentionAt));
    if (since === 0 || now - since < rule.waitingMinutes * MINUTE) return false;
  }
  if (rule.since === "today" && row.activityAt < startOfToday(now)) return false;
  if (rule.since === "week" && row.activityAt < now - 7 * 24 * 60 * MINUTE) return false;
  if (rule.excludeRead && !row.unread) return false;
  if (rule.excludeProjects.includes(row.thread.projectId)) return false;
  return true;
}

/** Projects in the order they are used: the freshest chat comes first. */
export function projectsByUse(
  rows: readonly Chat[],
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

/** The strip in the user's order: hidden entries dropped, Projects and Sections expanded. */
export function buildFolders(
  rows: readonly Chat[],
  projects: readonly PluginSidebarProject[],
  sections: readonly PluginSidebarSection[],
  layout: FolderLayout,
  now: number,
): Folder[] {
  const folders: Folder[] = [];
  const add = (
    base: Pick<Folder, "id" | "entryId" | "kind" | "name" | "icon" | "color" | "linkedProjectId"> & {
      personal?: boolean;
      startIn?: Folder["startIn"];
    },
    matches: (row: Chat) => boolean,
  ) => {
    const inside = rows.filter(matches);
    folders.push({
      personal: false,
      startIn: null,
      ...base,
      badge: base.kind === "attention" ? inside.length : inside.filter((row) => row.unread).length,
      lane: mostUrgentLane(inside),
      matches,
    });
  };
  for (const entry of layout.entries) {
    if (entry.hidden) continue;
    const common = {
      entryId: entry.id,
      kind: entry.kind,
      name: entry.name,
      icon: entry.icon,
      color: entry.color,
      linkedProjectId: linkedProjectId(entry),
    };
    switch (entry.kind) {
      case "all":
        add({ ...common, id: "all" }, () => true);
        break;
      case "attention":
        // Stays put even when empty, so the strip never shifts.
        add({ ...common, id: "attention" }, needsAttention);
        break;
      case "archive":
        folders.push({
          ...common,
          id: "archive",
          personal: false,
          badge: 0,
          lane: null,
          startIn: null,
          matches: (row) => row.thread.isArchived,
        });
        break;
      case "projects":
        for (const project of projectsByUse(rows, projects)) {
          add(
            {
              ...common,
              id: `project:${project.id}`,
              name: project.name,
              icon: null,
              personal: project.isPersonal,
              startIn: { projectId: project.id },
            },
            (row) => row.thread.projectId === project.id,
          );
        }
        break;
      case "sections": {
        const used = new Set(rows.map((row) => row.thread.sectionId));
        for (const section of sections) {
          if (!used.has(section.id)) continue;
          add(
            { ...common, id: `section:${section.id}`, name: section.name, startIn: { sectionId: section.id } },
            (row) => row.thread.sectionId === section.id,
          );
        }
        break;
      }
      case "custom": {
        const rule = entry.rule;
        if (rule === null) break;
        // A folder about one project (or one section) starts its chats there.
        const startIn =
          rule.projects.length === 1 || rule.sections.length === 1
            ? {
                ...(rule.projects.length === 1 ? { projectId: rule.projects[0] } : {}),
                ...(rule.sections.length === 1 ? { sectionId: rule.sections[0] } : {}),
              }
            : null;
        add({ ...common, id: `custom:${entry.id}`, startIn }, (row) => matchesRule(row, rule, now));
        break;
      }
    }
  }
  return folders;
}

/**
 * The strip as blocks: one per layout entry, so every folder of "a folder per
 * project" (or per section) moves together, in the order they are shown.
 */
export function folderBlocks(folders: readonly Folder[]): { entryId: string; folders: Folder[] }[] {
  const blocks: { entryId: string; folders: Folder[] }[] = [];
  for (const folder of folders) {
    const last = blocks[blocks.length - 1];
    if (last?.entryId === folder.entryId) last.folders.push(folder);
    else blocks.push({ entryId: folder.entryId, folders: [folder] });
  }
  return blocks;
}

export interface ProjectGroup {
  /** `pinned` for the pinned block, otherwise the project id (`""` when unknown). */
  key: string;
  project: PluginSidebarProject | null;
  chats: Chat[];
}

/**
 * "List headers" mode: pinned chats first as their own block, then one group
 * per project in order of use. Rows keep their order inside a group.
 */
export function groupByProject(rows: readonly Chat[], projects: readonly PluginSidebarProject[]): ProjectGroup[] {
  const pinned = rows.filter((row) => row.thread.isPinned);
  const rest = rows.filter((row) => !row.thread.isPinned);
  const groups: ProjectGroup[] = [];
  if (pinned.length > 0) groups.push({ key: "pinned", project: null, chats: pinned });
  const byProject = new Map<string, Chat[]>();
  for (const row of rest) {
    const list = byProject.get(row.thread.projectId) ?? [];
    list.push(row);
    byProject.set(row.thread.projectId, list);
  }
  for (const project of projectsByUse(rest, projects)) {
    const list = byProject.get(project.id);
    if (list !== undefined) groups.push({ key: project.id, project, chats: list });
    byProject.delete(project.id);
  }
  // Threads whose project bb did not send land in one trailing group.
  const orphans = [...byProject.values()].flat();
  if (orphans.length > 0) groups.push({ key: "", project: null, chats: orphans });
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
export function unreadIdsIn(rows: readonly Chat[], folder: Folder): string[] {
  return rows.filter(folder.matches).flatMap((row) => row.unreadIds);
}

/** Case-insensitive match on title, project, branch, and folded children's titles. */
export function matchesQuery(row: Chat, needle: string): boolean {
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
export function isQuiet(row: Chat, cutoff: number): boolean {
  return row.lane === null && !row.unread && !row.thread.isPinned && row.activityAt < cutoff;
}

/** The first letter or digit of a name, for avatars. */
export function initialOf(name: string): string {
  return (name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "•").toLocaleUpperCase();
}

/** A row's avatar letter: the project's, or the chat's own in the personal project. */
export function avatarLetter(row: Chat): string {
  return initialOf(row.project && !row.project.isPersonal ? row.project.name : row.thread.displayTitle);
}
