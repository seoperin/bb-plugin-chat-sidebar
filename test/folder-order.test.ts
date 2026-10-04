import { describe, expect, it } from "vitest";

import { defaultLayout, moveEntry } from "../lib/folders";
import { buildChats, buildFolders, folderBlocks } from "../lib/model";
import { NOW, project, thread } from "./fixtures";

const entries = ["all", "attention", "projects", "mine", "archive"].map((id) => ({ id }));
const order = (list: { id: string }[] | null) => list?.map((entry) => entry.id) ?? null;

describe("moveEntry", () => {
  it("moves an entry before or after another", () => {
    expect(order(moveEntry(entries, "mine", "attention", "before"))).toEqual([
      "all",
      "mine",
      "attention",
      "projects",
      "archive",
    ]);
    expect(order(moveEntry(entries, "attention", "archive", "after"))).toEqual([
      "all",
      "projects",
      "mine",
      "archive",
      "attention",
    ]);
  });

  it("returns null when nothing would change", () => {
    expect(moveEntry(entries, "mine", "projects", "after")).toBeNull();
    expect(moveEntry(entries, "mine", "mine", "before")).toBeNull();
    expect(moveEntry(entries, "mine", "missing", "before")).toBeNull();
  });
});

describe("folderBlocks", () => {
  it("keeps the folders of one entry together, as one block to drag", () => {
    const projects = [project("proj_a", "Alpha"), project("proj_b", "Beta")];
    const rows = buildChats(
      [thread("a", { projectId: "proj_a", updatedAt: NOW }), thread("b", { projectId: "proj_b", updatedAt: NOW - 1 })],
      projects,
    );
    const layout = defaultLayout({ projects: "tabs", sectionFolders: false, archiveFolder: true });
    const blocks = folderBlocks(buildFolders(rows, projects, [], layout, NOW));
    expect(blocks.map((block) => [block.entryId, block.folders.map((folder) => folder.id)])).toEqual([
      ["all", ["all"]],
      ["attention", ["attention"]],
      ["projects", ["project:proj_a", "project:proj_b"]],
      ["archive", ["archive"]],
    ]);
  });
});
