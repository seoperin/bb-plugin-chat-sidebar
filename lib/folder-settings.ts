// The folder editor and the three settings that predate it — "Projects",
// "Section folders" and "Archive folder" — describe the same thing, so they
// are kept in step: hiding Archive in the editor turns "Archive folder" off,
// and turning "Archive folder" off hides Archive. bb only reads settings it is
// told about, so dropping them would lose what people had set; keeping them
// in step keeps both ways of changing the folders working.
//
// Backend only, and free of the SDK so tests can run it.
import { normalizeLayout, type EntryKind, type FolderLayout } from "./folders";

export interface LegacyFolderSettings {
  /** "Folders" (or the 0.1 label "Folder tabs"), "List headers", or "Off". */
  projects: string;
  sectionFolders: boolean;
  archiveFolder: boolean;
}

function showsProjectFolders(projects: string): boolean {
  return projects === "Folders" || projects === "Folder tabs";
}

function visible(layout: FolderLayout, kind: EntryKind): boolean {
  return layout.entries.some((entry) => entry.kind === kind && !entry.hidden);
}

/** The settings change that matches a saved layout, or null when they already agree. */
export function settingsPatchFor(
  layout: FolderLayout,
  current: LegacyFolderSettings,
): Partial<LegacyFolderSettings> | null {
  const patch: Partial<LegacyFolderSettings> = {};
  const projects = visible(layout, "projects");
  // Hidden project folders keep "List headers" if that was the choice; only "Folders" turns off.
  if (projects && !showsProjectFolders(current.projects)) patch.projects = "Folders";
  if (!projects && showsProjectFolders(current.projects)) patch.projects = "Off";
  if (visible(layout, "sections") !== current.sectionFolders) patch.sectionFolders = visible(layout, "sections");
  if (visible(layout, "archive") !== current.archiveFolder) patch.archiveFolder = visible(layout, "archive");
  return Object.keys(patch).length === 0 ? null : patch;
}

/** The saved layout after the settings changed, or null when it already matches them. */
export function layoutWithSettings(layout: FolderLayout, settings: LegacyFolderSettings): FolderLayout | null {
  const want: Partial<Record<EntryKind, boolean>> = {
    projects: showsProjectFolders(settings.projects),
    sections: settings.sectionFolders,
    archive: settings.archiveFolder,
  };
  let changed = false;
  const entries = layout.entries.map((entry) => {
    const shown = want[entry.kind];
    if (shown === undefined || shown === !entry.hidden) return entry;
    changed = true;
    return { ...entry, hidden: !shown };
  });
  return changed ? normalizeLayout({ ...layout, entries }) : null;
}
