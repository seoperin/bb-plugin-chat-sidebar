import { describe, expect, it } from "vitest";

import {
  buildChats,
  buildFolders,
  groupByProject,
  isQuiet,
  matchesQuery,
  matchesRule,
  pinNeighbors,
  unreadIdsIn,
} from "../lib/model";
import { customEntry, defaultLayout, emptyRule, normalizeLayout, type FolderLayout } from "../lib/folders";
import { NOW, project, thread } from "./fixtures";

const layoutOf = (projectTabs: boolean, sectionTabs: boolean, archiveTab: boolean): FolderLayout =>
  defaultLayout({ projects: projectTabs ? "tabs" : "off", sectionFolders: sectionTabs, archiveFolder: archiveTab });

const projects = [project("proj_a", "Alpha"), project("proj_b", "Beta"), project("proj_me", "Personal", true)];
const ids = (rows: { thread: { id: string } }[]) => rows.map((row) => row.thread.id);

describe("buildChats", () => {
  it("folds sub-agents into their root and lifts the most urgent status", () => {
    const rows = buildChats(
      [
        thread("root", { updatedAt: NOW - 10_000 }),
        thread("child", { parentThreadId: "root", hasPendingInteraction: true, isUnread: true, updatedAt: NOW }),
      ],
      projects,
    );
    expect(ids(rows)).toEqual(["root"]);
    expect(rows[0]).toMatchObject({ lane: "attention", unread: true, unreadIds: ["child"], busyChildren: 1 });
    expect(rows[0]?.children.map((child) => child.id)).toEqual(["child"]);
    expect(rows[0]?.activityAt).toBe(NOW);
  });

  it("keeps every thread on its own row when folding is off", () => {
    const rows = buildChats([thread("root"), thread("child", { parentThreadId: "root" })], projects, {
      foldChildren: false,
    });
    expect(ids(rows).sort()).toEqual(["child", "root"]);
  });

  it("puts pins first in bb's manual order, then sorts by activity", () => {
    const rows = buildChats(
      [
        thread("old", { updatedAt: NOW - 50_000 }),
        thread("new", { updatedAt: NOW }),
        thread("pinB", { isPinned: true, pinSortKey: "b", updatedAt: NOW - 90_000 }),
        thread("pinA", { isPinned: true, pinSortKey: "a", updatedAt: NOW - 99_000 }),
        thread("pinLoose", { isPinned: true, pinnedAt: 5 }),
      ],
      projects,
    );
    expect(ids(rows)).toEqual(["pinA", "pinB", "pinLoose", "new", "old"]);
  });

  it("skips hidden threads and splits active from archived", () => {
    const threads = [
      thread("live"),
      thread("hidden", { isHidden: true }),
      thread("gone1", { isArchived: true, archivedAt: 1 }),
      thread("gone2", { isArchived: true, archivedAt: 2 }),
    ];
    expect(ids(buildChats(threads, projects))).toEqual(["live"]);
    expect(ids(buildChats(threads, projects, { lifecycle: "archived" }))).toEqual(["gone2", "gone1"]);
  });
});

describe("folders", () => {
  const rows = buildChats(
    [
      thread("a1", { projectId: "proj_a", updatedAt: NOW - 5_000, isUnread: true }),
      thread("b1", { projectId: "proj_b", updatedAt: NOW, status: "active" }),
      thread("s1", { projectId: "proj_a", sectionId: "sec_1", updatedAt: NOW - 9_000 }),
    ],
    projects,
  );
  const sections = [
    { id: "sec_1", name: "Later", createdAt: 0, updatedAt: 0 },
    { id: "sec_empty", name: "Empty", createdAt: 0, updatedAt: 0 },
  ];

  it("always shows All and Attention, then projects by use, used sections, and Archive", () => {
    const folders = buildFolders(rows, projects, sections, layoutOf(true, true, true), NOW);
    expect(folders.map((folder) => folder.id)).toEqual([
      "all",
      "attention",
      "project:proj_b",
      "project:proj_a",
      "section:sec_1",
      "archive",
    ]);
    const attention = folders.find((folder) => folder.id === "attention");
    expect(attention).toMatchObject({ badge: 2, lane: "working" });
    expect(folders.find((folder) => folder.id === "project:proj_a")).toMatchObject({ name: "Alpha", badge: 1 });
  });

  it("leaves muted chats out of badges and Attention", () => {
    const folders = buildFolders(rows, projects, sections, layoutOf(true, true, true), NOW, (row) => row.thread.id === "a1");
    const byId = (id: string) => folders.find((folder) => folder.id === id)!;
    expect(byId("attention")).toMatchObject({ badge: 1, lane: "working" });
    expect(ids(rows.filter((row) => byId("attention").matches(row)))).toEqual(["b1"]);
    expect(byId("project:proj_a")).toMatchObject({ badge: 0 });
    // Still in its own folders, just quiet.
    expect(ids(rows.filter((row) => byId("project:proj_a").matches(row)))).toEqual(["a1", "s1"]);
  });

  it("keeps Attention even when nothing needs the user", () => {
    const calm = buildChats([thread("calm")], projects);
    const folders = buildFolders(calm, projects, [], layoutOf(false, false, false), NOW);
    expect(folders.map((folder) => folder.id)).toEqual(["all", "attention"]);
    expect(folders[1]).toMatchObject({ badge: 0, lane: null });
  });

  it("filters rows by folder and collects a folder's unread threads", () => {
    const folders = buildFolders(rows, projects, sections, layoutOf(true, true, true), NOW);
    const byId = (id: string) => folders.find((folder) => folder.id === id)!;
    expect(ids(rows.filter((row) => byId("attention").matches(row)))).toEqual(["b1", "a1"]);
    expect(ids(rows.filter((row) => byId("project:proj_a").matches(row)))).toEqual(["a1", "s1"]);
    expect(ids(rows.filter((row) => byId("section:sec_1").matches(row)))).toEqual(["s1"]);
    expect(unreadIdsIn(rows, byId("all"))).toEqual(["a1"]);
  });

  it("follows the user's order, drops hidden entries and adds custom folders", () => {
    const base = layoutOf(true, false, true);
    const mine = customEntry("Mine", "Star", { projects: ["proj_a"] });
    const layout = normalizeLayout({
      version: 1,
      entries: [
        base.entries[0]!,
        mine,
        ...base.entries.slice(1).map((entry) => (entry.kind === "attention" ? { ...entry, hidden: true } : entry)),
      ],
    });
    const folders = buildFolders(rows, projects, sections, layout, NOW);
    expect(folders.map((folder) => folder.id)).toEqual([
      "all",
      `custom:${mine.id}`,
      "project:proj_b",
      "project:proj_a",
      "archive",
    ]);
    expect(folders[1]).toMatchObject({ name: "Mine", icon: "Star", startIn: { projectId: "proj_a" } });
  });
});

describe("folder layout", () => {
  it("derives the old strip from the settings, so nothing changes until the user edits", () => {
    expect(layoutOf(true, true, true).entries.map((entry) => [entry.kind, entry.hidden])).toEqual([
      ["all", false],
      ["attention", false],
      ["projects", false],
      ["sections", false],
      ["archive", false],
    ]);
  });

  it("repairs a stored layout: All first, every built-in once, no duplicates", () => {
    const mine = customEntry("Mine", "Star");
    const fixed = normalizeLayout({
      version: 1,
      entries: [mine, { ...layoutOf(true, true, true).entries[2]! }, mine, { ...mine, id: "all", kind: "custom" }],
    });
    expect(fixed.entries.map((entry) => entry.id)).toEqual([
      "all",
      mine.id,
      "projects",
      "attention",
      "sections",
      "archive",
    ]);
    expect(fixed.entries[0]?.hidden).toBe(false);
  });
});

describe("matchesRule", () => {
  const chats = buildChats(
    [
      thread("wait", { projectId: "proj_a", hasPendingInteraction: true, latestAttentionAt: NOW - 2 * 3_600_000 }),
      thread("fresh", { projectId: "proj_a", hasPendingInteraction: true, latestAttentionAt: NOW - 60_000 }),
      thread("err", { projectId: "proj_b", status: "error", updatedAt: NOW }),
      thread("calm", { projectId: "proj_b", updatedAt: NOW - 10 * 86_400_000 }),
    ],
    projects,
  );
  const pick = (rule: Partial<ReturnType<typeof emptyRule>>) =>
    ids(chats.filter((row) => matchesRule(row, { ...emptyRule(), ...rule }, NOW))).sort();

  it("holds nothing without filters or chats", () => {
    expect(pick({})).toEqual([]);
  });

  it("combines filters with and, values within one filter with or", () => {
    expect(pick({ statuses: ["waiting", "failed"] })).toEqual(["err", "fresh", "wait"]);
    expect(pick({ statuses: ["waiting", "failed"], projects: ["proj_b"] })).toEqual(["err"]);
  });

  it("waits longer than a threshold", () => {
    expect(pick({ statuses: ["waiting"], waitingMinutes: 60 })).toEqual(["wait"]);
  });

  it("keeps chats added by hand and drops chats excluded by hand", () => {
    expect(pick({ chats: ["calm"] })).toEqual(["calm"]);
    expect(pick({ projects: ["proj_b"], excludeChats: ["calm"] })).toEqual(["err"]);
  });

  it("filters by activity since", () => {
    expect(pick({ projects: ["proj_b"], since: "week" })).toEqual(["err"]);
  });
});

describe("groupByProject", () => {
  it("puts pins first, then projects by use, then threads with an unknown project", () => {
    const rows = buildChats(
      [
        thread("pin", { isPinned: true, projectId: "proj_b" }),
        thread("a", { projectId: "proj_a", updatedAt: NOW - 1_000 }),
        thread("b", { projectId: "proj_b", updatedAt: NOW }),
        thread("x", { projectId: "proj_unknown", updatedAt: NOW - 2_000 }),
      ],
      projects,
    );
    const groups = groupByProject(rows, projects);
    expect(groups.map((group) => [group.key, ids(group.chats)])).toEqual([
      ["pinned", ["pin"]],
      ["proj_b", ["b"]],
      ["proj_a", ["a"]],
      ["", ["x"]],
    ]);
  });
});

describe("pinNeighbors", () => {
  it("returns the neighbours bb needs and the expected order", () => {
    expect(pinNeighbors(["a", "b", "c"], "c", "a", "before")).toEqual({
      previousThreadId: null,
      nextThreadId: "a",
      order: ["c", "a", "b"],
    });
    expect(pinNeighbors(["a", "b", "c"], "a", "b", "after")).toEqual({
      previousThreadId: "b",
      nextThreadId: "c",
      order: ["b", "a", "c"],
    });
  });

  it("ignores drops that change nothing", () => {
    expect(pinNeighbors(["a", "b"], "a", "a", "before")).toBeNull();
    expect(pinNeighbors(["a", "b"], "a", "b", "before")).toBeNull();
    expect(pinNeighbors(["a", "b"], "a", "missing", "after")).toBeNull();
  });
});

describe("search and quiet chats", () => {
  const [row] = buildChats(
    [
      thread("root", {
        title: "Fix login",
        environment: {
          id: "env",
          name: null,
          branchName: "feat/oauth",
          path: null,
          isWorktree: true,
          providerId: null,
          workspaceDisplayKind: null,
        },
      }),
      thread("child", { title: "Write tests", parentThreadId: "root" }),
    ],
    projects,
  );

  it("matches title, project, branch, and folded children", () => {
    expect(row).toBeDefined();
    if (row === undefined) return;
    for (const needle of ["login", "alpha", "oauth", "write tests", ""]) {
      expect(matchesQuery(row, needle)).toBe(true);
    }
    expect(matchesQuery(row, "nope")).toBe(false);
  });

  it("calls a chat quiet only when it is calm, read, unpinned, and old", () => {
    expect(row).toBeDefined();
    if (row === undefined) return;
    expect(isQuiet(row, NOW)).toBe(true);
    expect(isQuiet(row, NOW - 7_200_000)).toBe(false);
    expect(isQuiet({ ...row, unread: true }, NOW)).toBe(false);
    expect(isQuiet({ ...row, lane: "done" }, NOW)).toBe(false);
  });
});
