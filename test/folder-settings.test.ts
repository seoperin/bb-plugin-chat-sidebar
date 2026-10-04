import { describe, expect, it } from "vitest";

import { layoutWithSettings, settingsPatchFor } from "../lib/folder-settings";
import { defaultLayout, type FolderLayout } from "../lib/folders";

const base = defaultLayout({ projects: "tabs", sectionFolders: true, archiveFolder: true });
const hide = (layout: FolderLayout, kind: string): FolderLayout => ({
  ...layout,
  entries: layout.entries.map((entry) => (entry.kind === kind ? { ...entry, hidden: true } : entry)),
});
const shown = (layout: FolderLayout | null) =>
  layout?.entries.filter((entry) => !entry.hidden).map((entry) => entry.kind) ?? null;

describe("settings kept in step with the folder editor", () => {
  it("asks for nothing when they already agree", () => {
    expect(settingsPatchFor(base, { projects: "Folders", sectionFolders: true, archiveFolder: true })).toBeNull();
  });

  it("turns settings off for folders hidden in the editor", () => {
    const layout = hide(hide(hide(base, "projects"), "sections"), "archive");
    expect(settingsPatchFor(layout, { projects: "Folders", sectionFolders: true, archiveFolder: true })).toEqual({
      projects: "Off",
      sectionFolders: false,
      archiveFolder: false,
    });
  });

  it("leaves List headers alone while project folders stay hidden", () => {
    expect(
      settingsPatchFor(hide(base, "projects"), { projects: "List headers", sectionFolders: true, archiveFolder: true }),
    ).toBeNull();
  });

  it("shows and hides folders when the settings change", () => {
    const layout = layoutWithSettings(base, { projects: "List headers", sectionFolders: false, archiveFolder: true });
    expect(shown(layout)).toEqual(["all", "attention", "archive"]);
    expect(layoutWithSettings(base, { projects: "Folder tabs", sectionFolders: true, archiveFolder: true })).toBeNull();
  });
});
