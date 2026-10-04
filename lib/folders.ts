// The folder strip as the user arranges it.
//
// One ordered list of entries. "All" is always first. Attention and Archive
// are fixed folders, Projects and Sections each expand into a folder per
// project or section, and custom folders hold a rule. Every entry but All can
// be hidden and moved; every one but Projects and Sections, which take their
// names from bb, can be renamed. A custom folder about one project wears that
// project's colour (see `linkedProjectId`).
//
// A custom folder works like Telegram's: chats added by hand are always in,
// chats excluded by hand never are, and the rest must pass every filter that
// is set. A rule with no filters and no chats holds nothing.
//
// No zod here: the list imports this file. The backend validates the stored
// layout with the schema in `rpc.ts` and then passes it through `normalizeLayout`.
import type { ColorId } from "./colors";
import type { ChatSettings } from "./settings";

export const FOLDER_STATUSES = ["waiting", "failed", "working", "unread", "pinned"] as const;
export type FolderStatus = (typeof FOLDER_STATUSES)[number];

export const FOLDER_SINCE = ["any", "today", "week"] as const;
export type FolderSince = (typeof FOLDER_SINCE)[number];

export interface FolderRule {
  /** Any of these. */
  statuses: FolderStatus[];
  projects: string[];
  sections: string[];
  providers: string[];
  /** In the title, the branch, the project, or a sub-agent's title. */
  text: string;
  /** Waiting for you at least this long; 0 is off. */
  waitingMinutes: number;
  /** Activity since. */
  since: FolderSince;
  /** Always in. */
  chats: string[];
  excludeRead: boolean;
  excludeProjects: string[];
  /** Never in. */
  excludeChats: string[];
}

export type EntryKind = "all" | "attention" | "archive" | "projects" | "sections" | "custom";

export interface FolderEntry {
  /** The kind for built-ins, a generated id for custom folders. */
  id: string;
  kind: EntryKind;
  /** Null keeps the translated built-in name. */
  name: string | null;
  /** A bb icon name (or this plugin's `chat-sidebar/…`); null keeps the default. */
  icon: string | null;
  /** Unused while the folder is about one project: it wears the project's colour. */
  color: ColorId | null;
  hidden: boolean;
  /** Custom folders only. */
  rule: FolderRule | null;
}

export interface FolderLayout {
  version: 1;
  entries: FolderEntry[];
}

/** Realtime channel the backend publishes the saved folder layout on. */
export const FOLDERS_CHANNEL = "folders";

export const MAX_CUSTOM_FOLDERS = 40;
export const MAX_RULE_ITEMS = 500;
export const MAX_NAME = 40;

/** The default icon of each kind. Project folders draw the project's avatar instead. */
export const DEFAULT_ICONS: Record<EntryKind, string> = {
  all: "MessageSquare",
  attention: "BellDot",
  archive: "Archive",
  projects: "Folder",
  sections: "Folder",
  custom: "Folder",
};

const BUILT_IN_ORDER: readonly Exclude<EntryKind, "custom">[] = ["all", "attention", "projects", "sections", "archive"];

export function emptyRule(): FolderRule {
  return {
    statuses: [],
    projects: [],
    sections: [],
    providers: [],
    text: "",
    waitingMinutes: 0,
    since: "any",
    chats: [],
    excludeRead: false,
    excludeProjects: [],
    excludeChats: [],
  };
}

function builtIn(kind: Exclude<EntryKind, "custom">, hidden: boolean): FolderEntry {
  return { id: kind, kind, name: null, icon: null, color: null, hidden, rule: null };
}

/** What the strip looked like before folders could be arranged, from the old settings. */
export function defaultLayout(
  settings: Pick<ChatSettings, "projects" | "sectionFolders" | "archiveFolder">,
): FolderLayout {
  return {
    version: 1,
    entries: [
      builtIn("all", false),
      builtIn("attention", false),
      builtIn("projects", settings.projects !== "tabs"),
      builtIn("sections", !settings.sectionFolders),
      builtIn("archive", !settings.archiveFolder),
    ],
  };
}

/**
 * Makes any stored layout usable: every built-in exactly once, All first and
 * visible, custom folders with a rule, nothing duplicated.
 */
export function normalizeLayout(layout: FolderLayout): FolderLayout {
  const seen = new Set<string>();
  const entries: FolderEntry[] = [];
  for (const entry of layout.entries) {
    if (seen.has(entry.id)) continue;
    if (entry.kind === "custom") {
      if (entry.rule === null || BUILT_IN_ORDER.includes(entry.id as never)) continue;
    } else if (entry.id !== entry.kind) {
      continue;
    }
    seen.add(entry.id);
    entries.push(entry.kind === "custom" ? entry : { ...entry, rule: null });
  }
  for (const kind of BUILT_IN_ORDER) {
    if (!seen.has(kind)) entries.push(builtIn(kind, kind !== "all"));
  }
  const all = entries.find((entry) => entry.kind === "all");
  const rest = entries.filter((entry) => entry.kind !== "all");
  return { version: 1, entries: all === undefined ? rest : [{ ...all, hidden: false }, ...rest] };
}

function newFolderId(): string {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export type TemplateId = "waitingLong" | "failedToday" | "working" | "unread" | "pinned";

/** Ready-made smart folders. */
export const TEMPLATES: Record<TemplateId, { icon: string; rule: Partial<FolderRule> }> = {
  waitingLong: { icon: "Clock", rule: { statuses: ["waiting"], waitingMinutes: 60 } },
  failedToday: { icon: "AlertTriangle", rule: { statuses: ["failed"], since: "today" } },
  working: { icon: "Zap", rule: { statuses: ["working"] } },
  unread: { icon: "MailOpen", rule: { statuses: ["unread"] } },
  pinned: { icon: "Pin", rule: { statuses: ["pinned"] } },
};

export function customEntry(name: string, icon: string, rule: Partial<FolderRule> = {}): FolderEntry {
  return {
    id: newFolderId(),
    kind: "custom",
    name,
    icon,
    color: null,
    hidden: false,
    rule: { ...emptyRule(), ...rule },
  };
}

/**
 * The one project a custom folder is about, if it is about exactly one. Such
 * a folder wears its project's colour, the same one its chats' avatars have,
 * so a colour picked for it is the project's colour.
 */
export function linkedProjectId(entry: Pick<FolderEntry, "kind" | "rule">): string | null {
  return entry.kind === "custom" && entry.rule !== null && entry.rule.projects.length === 1
    ? (entry.rule.projects[0] ?? null)
    : null;
}

/** The entries after dropping one before or after another; null when nothing moves. */
export function moveEntry<T extends { id: string }>(
  entries: readonly T[],
  draggedId: string,
  targetId: string,
  place: "before" | "after",
): T[] | null {
  if (draggedId === targetId) return null;
  const moved = entries.find((entry) => entry.id === draggedId);
  const rest = entries.filter((entry) => entry.id !== draggedId);
  const index = rest.findIndex((entry) => entry.id === targetId);
  if (moved === undefined || index === -1) return null;
  const at = place === "before" ? index : index + 1;
  const next = [...rest.slice(0, at), moved, ...rest.slice(at)];
  return next.every((entry, position) => entry.id === entries[position]?.id) ? null : next;
}

/** True when the rule picks chats by itself, not only by hand. */
export function hasFilters(rule: FolderRule): boolean {
  return (
    rule.statuses.length > 0 ||
    rule.projects.length > 0 ||
    rule.sections.length > 0 ||
    rule.providers.length > 0 ||
    rule.text.trim() !== "" ||
    rule.waitingMinutes > 0 ||
    rule.since !== "any"
  );
}

/**
 * Icons for the picker, one grid with related icons next to each other.
 * bb's own names first; `chat-sidebar/…` are this plugin's Hugeicons declared
 * in the manifest (`bb.branding.experimental_icons`).
 */
const FOLDER_ICON_GROUPS: readonly { id: string; icons: readonly string[] }[] = [
  {
    id: "general",
    icons: [
      "Folder",
      "FolderOpen",
      "Folder02",
      "Layers",
      "GridView",
      "Star",
      "Pin",
      "BellDot",
      "MessageSquare",
      "MessageQuestion",
      "SideChat",
      "Mail",
      "Sent",
      "News01",
      "Archive",
      "ListTodo",
      "CircleCheck",
      "AlertTriangle",
      "Target",
      "Clock",
      "TimeSchedule",
      "Calendar",
      "Limitation",
      "Zap",
      "Play",
      "Pause",
      "Repeat",
      "Lock",
      "SecurityCheck",
      "UserRound",
      "Eye",
      "Search",
      "Edit",
      "Settings",
      "Info",
      "File",
      "FileText",
      "ChartColumn",
      "Palette",
    ],
  },
  {
    id: "work",
    icons: [
      "Code",
      "Terminal",
      "ComputerTerminal01",
      "Bug",
      "Beaker",
      "Fork",
      "GitBranch",
      "GitMerge",
      "GitPullRequest",
      "FolderGit",
      "Github",
      "Bot",
      "Brain",
      "AiBrain01",
      "AiBrowser",
      "AiContentGenerator01",
      "Browser",
      "Globe",
      "Explore",
      "Cloud",
      "ComputerCloud",
      "Laptop",
      "Smartphone",
      "Plug02",
      "ElectricPlugs",
      "PackageReceive",
      "Workflow",
      "Puzzle",
      "Toolbox",
      "ToolCase",
      "Discord",
    ],
  },
  {
    id: "travel",
    icons: [
      "chat-sidebar/airplane",
      "chat-sidebar/luggage",
      "chat-sidebar/passport",
      "chat-sidebar/map",
      "chat-sidebar/location",
      "chat-sidebar/compass",
      "chat-sidebar/beach",
      "chat-sidebar/mountain",
      "chat-sidebar/tent",
      "chat-sidebar/car",
      "chat-sidebar/train",
    ],
  },
  {
    id: "learning",
    icons: [
      "chat-sidebar/language",
      "chat-sidebar/translate",
      "chat-sidebar/book-open",
      "chat-sidebar/book",
      "chat-sidebar/graduation",
      "chat-sidebar/teacher",
      "chat-sidebar/notebook",
      "chat-sidebar/pen",
      "chat-sidebar/idea",
    ],
  },
  {
    id: "money",
    icons: [
      "chat-sidebar/wallet",
      "chat-sidebar/coins",
      "chat-sidebar/dollar",
      "chat-sidebar/bitcoin",
      "chat-sidebar/chart-line",
      "chat-sidebar/credit-card",
      "chat-sidebar/cart",
      "chat-sidebar/briefcase",
      "chat-sidebar/office",
    ],
  },
  {
    id: "life",
    icons: [
      "chat-sidebar/home",
      "chat-sidebar/people",
      "chat-sidebar/heart",
      "chat-sidebar/cat",
      "chat-sidebar/paw",
      "chat-sidebar/gift",
      "Coffee",
    ],
  },
  {
    id: "health",
    icons: [
      "chat-sidebar/dumbbell",
      "chat-sidebar/run",
      "chat-sidebar/yoga",
      "chat-sidebar/football",
      "chat-sidebar/basketball",
      "chat-sidebar/medicine",
      "chat-sidebar/stethoscope",
      "chat-sidebar/apple",
    ],
  },
  {
    id: "hobby",
    icons: [
      "chat-sidebar/gamepad",
      "chat-sidebar/music",
      "chat-sidebar/headphones",
      "chat-sidebar/camera",
      "chat-sidebar/video",
      "chat-sidebar/paint",
      "chat-sidebar/guitar",
      "chat-sidebar/pizza",
      "chat-sidebar/restaurant",
    ],
  },
  {
    id: "other",
    icons: [
      "chat-sidebar/rocket",
      "chat-sidebar/fire",
      "chat-sidebar/trophy",
      "chat-sidebar/crown",
      "chat-sidebar/diamond",
      "chat-sidebar/flag",
      "chat-sidebar/smile",
      "chat-sidebar/sun",
      "chat-sidebar/plant",
    ],
  },
];

export const FOLDER_ICONS: readonly string[] = FOLDER_ICON_GROUPS.flatMap((group) => group.icons);
