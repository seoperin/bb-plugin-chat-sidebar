import { describe, expect, it } from "vitest";

import { describeChange } from "../lib/folder-history";
import { customEntry, defaultLayout, type FolderLayout } from "../lib/folders";

const base = defaultLayout({ projects: "tabs", sectionFolders: true, archiveFolder: true });
const mine = customEntry("Mine", "Star", { projects: ["proj_a"] });
const withMine: FolderLayout = { ...base, entries: [...base.entries, mine] };
const kinds = (before: FolderLayout | null, after: FolderLayout | null) =>
  describeChange(before, after).map((change) => change.kind);

describe("describeChange", () => {
  it("names a reset and the first arrangement", () => {
    expect(kinds(withMine, null)).toEqual(["reset"]);
    expect(kinds(null, withMine)).toEqual(["arranged"]);
    expect(kinds(null, null)).toEqual([]);
  });

  it("names added and deleted folders", () => {
    expect(kinds(base, withMine)).toEqual(["added"]);
    expect(kinds(withMine, base)).toEqual(["removed"]);
  });

  it("names a rename, hiding and an edit of the same folder", () => {
    const after = {
      ...withMine,
      entries: withMine.entries.map((entry) =>
        entry.id === mine.id ? { ...entry, name: "Ours", hidden: true, icon: "Bug" } : entry,
      ),
    };
    const changes = describeChange(withMine, after);
    expect(changes.map((change) => change.kind)).toEqual(["renamed", "hidden", "edited"]);
    expect(changes[0]).toMatchObject({ from: { name: "Mine" }, entry: { name: "Ours" } });
  });

  it("names a move only when the order of shared folders changed", () => {
    const moved = { ...withMine, entries: [withMine.entries[0]!, mine, ...withMine.entries.slice(1, -1)] };
    expect(kinds(withMine, moved)).toEqual(["moved"]);
    expect(kinds(withMine, withMine)).toEqual([]);
  });
});
