import { describe, expect, it } from "vitest";

import { parseSettings } from "../lib/settings";

describe("parseSettings", () => {
  it("maps stored option labels to ids and defends against junk", () => {
    expect(parseSettings(undefined)).toEqual({
      language: "auto",
      projects: "tabs",
      folderLayout: "tabs",
      folderNames: true,
      density: "comfortable",
      stickyHeadings: true,
      sectionFolders: true,
      archiveFolder: true,
      foldChildren: true,
      hideQuietAfterDays: 0,
    });
    expect(
      parseSettings({
        language: "Русский",
        projects: "List headers",
        density: "Compact",
        archiveFolder: false,
        hideQuietAfterDays: 7.6,
      }),
    ).toMatchObject({ language: "ru", projects: "headers", density: "compact", archiveFolder: false, hideQuietAfterDays: 8 });
    expect(parseSettings({ language: "Klingon", hideQuietAfterDays: -3, foldChildren: "yes" })).toMatchObject({
      language: "auto",
      hideQuietAfterDays: 0,
      foldChildren: true,
    });
  });
});

describe("legacy option labels", () => {
  it("still reads the 0.1 label of the Folders option", () => {
    expect(parseSettings({ projects: "Folder tabs" }).projects).toBe("tabs");
  });
});
