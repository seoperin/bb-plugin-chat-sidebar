// Plugin settings: one description for the backend (`bb.settings.define`)
// and the frontend (defaults while bb loads the values, plus parsing).
//
// bb renders these labels on the plugin's settings page as written, so they
// stay in English. The list itself is translated (see `lib/i18n`).
//
// Select options are stored as the visible strings, so the parsers below map
// them to stable ids and fall back to the default for anything unknown.

export const LANGUAGE_OPTIONS = ["Auto", "English", "Русский"] as const;
export const PROJECT_OPTIONS = ["Folders", "List headers", "Off"] as const;
export const FOLDER_LAYOUT_OPTIONS = ["Tabs above the list", "Rail on the left"] as const;
export const DENSITY_OPTIONS = ["Comfortable", "Compact"] as const;

export const SETTINGS = {
  language: {
    type: "select",
    label: "Language",
    description: "Auto follows the system language and falls back to English.",
    options: [...LANGUAGE_OPTIONS] as string[],
    default: "Auto",
  },
  projects: {
    type: "select",
    label: "Projects",
    description:
      "Folders: a folder per project. List headers: the list grouped under project headings. Off: one list. Kept in step with the Projects folder in the folder editor.",
    options: [...PROJECT_OPTIONS] as string[],
    default: "Folders",
  },
  folderLayout: {
    type: "select",
    label: "Folder layout",
    description: "Tabs sit above the list. The rail is a narrow column on the left with an icon and a name per folder.",
    options: [...FOLDER_LAYOUT_OPTIONS] as string[],
    default: "Tabs above the list",
  },
  density: {
    type: "select",
    label: "Row size",
    description: "Comfortable shows an avatar and a second line with status and branch.",
    options: [...DENSITY_OPTIONS] as string[],
    default: "Comfortable",
  },
  stickyHeadings: {
    type: "boolean",
    label: "Keep project headings in view",
    description: "With list headers, the current project's heading stays under the tabs while you scroll.",
    default: true,
  },
  sectionFolders: {
    type: "boolean",
    label: "Section folders",
    description:
      "A folder for each of your bb sidebar sections. Kept in step with the Sections folder in the folder editor.",
    default: true,
  },
  archiveFolder: {
    type: "boolean",
    label: "Archive folder",
    description: "Kept in step with the Archive folder in the folder editor.",
    default: true,
  },
  foldChildren: {
    type: "boolean",
    label: "Fold sub-agents into their parent chat",
    description: "Sub-agents and forks share their parent's row and lift its status.",
    default: true,
  },
  hideQuietAfterDays: {
    type: "number",
    label: "Hide quiet chats after, days (0 = never)",
    description:
      "Chats with no activity, nothing unread and no pin stay one click away. Search and Attention still show them.",
    default: 0,
  },
} as const;

export type Language = "auto" | "en" | "ru";
export type ProjectGrouping = "tabs" | "headers" | "off";
export type FolderLayout = "tabs" | "rail";
export type Density = "comfortable" | "compact";

export interface ChatSettings {
  language: Language;
  projects: ProjectGrouping;
  folderLayout: FolderLayout;
  density: Density;
  stickyHeadings: boolean;
  sectionFolders: boolean;
  archiveFolder: boolean;
  foldChildren: boolean;
  hideQuietAfterDays: number;
}

function pick<T>(value: unknown, options: Record<string, T>, fallback: T): T {
  return typeof value === "string" && Object.hasOwn(options, value) ? (options[value] as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Turns whatever bb stored into typed settings; never throws. */
export function parseSettings(values: Readonly<Record<string, unknown>> | undefined): ChatSettings {
  const source = values ?? {};
  const days = source.hideQuietAfterDays;
  return {
    language: pick<Language>(source.language, { Auto: "auto", English: "en", Русский: "ru" }, "auto"),
    projects: pick<ProjectGrouping>(
      source.projects,
      // "Folder tabs" is the 0.1 label of "Folders".
      { Folders: "tabs", "Folder tabs": "tabs", "List headers": "headers", Off: "off" },
      "tabs",
    ),
    folderLayout: pick<FolderLayout>(
      source.folderLayout,
      { "Tabs above the list": "tabs", "Rail on the left": "rail" },
      "tabs",
    ),
    density: pick<Density>(source.density, { Comfortable: "comfortable", Compact: "compact" }, "comfortable"),
    stickyHeadings: bool(source.stickyHeadings, SETTINGS.stickyHeadings.default),
    sectionFolders: bool(source.sectionFolders, SETTINGS.sectionFolders.default),
    archiveFolder: bool(source.archiveFolder, SETTINGS.archiveFolder.default),
    foldChildren: bool(source.foldChildren, SETTINGS.foldChildren.default),
    hideQuietAfterDays:
      typeof days === "number" && Number.isFinite(days) ? Math.min(3650, Math.max(0, Math.round(days))) : 0,
  };
}
