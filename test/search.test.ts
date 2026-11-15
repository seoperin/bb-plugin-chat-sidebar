import { describe, expect, it } from "vitest";
import { buildChats } from "../lib/model";
import { chatSearchScore, normalizeSearch, titleSearchScore } from "../lib/search";
import { project, thread } from "./fixtures";

describe("title search", () => {
  it.each([
    ["Проверка журналов сервиса", "ЖУРНАЛОВ проверка"],
    ["TASK-1042 [Example] Update service settings", "TASK1042"],
    ["TASK-1042 [Example] Update service settings", "example 1042"],
    ["Настройки учётной записи", "учетной настройки"],
    ["Widget — Release Review", "release   widget"],
  ])("finds %s with %s", (title, query) => {
    expect(titleSearchScore(title, query)).toBeGreaterThan(0);
  });

  it("does not match missing words or a symbol-only query", () => {
    expect(titleSearchScore("Widget", "widget retry")).toBe(0);
    expect(titleSearchScore("Widget", "---")).toBe(0);
    expect(normalizeSearch(" CASE_1042 ")).toBe("case 1042");
  });

  it.each(["widgte", "widet", "widgget", "widgetb", "widjet"])("allows one typo: %s", (query) => {
    expect(titleSearchScore("Widget", query)).toBe(0.5);
    expect(titleSearchScore("Widget", "Widget")).toBeGreaterThan(titleSearchScore("Widget", query));
  });

  it("never corrects task numbers, short words or two typos", () => {
    expect(titleSearchScore("TASK-1042", "TASK1043")).toBe(0);
    expect(titleSearchScore("logs", "lows")).toBe(0);
    expect(titleSearchScore("Widget", "wixjet")).toBe(0);
  });

  it("ranks exact titles above prefixes, phrases and separate words", () => {
    const scores = ["Widget retry", "Widget retry fixes", "Fix Widget retry", "Retry fixes for Widget"]
      .map((title) => titleSearchScore(title, "widget retry"));
    expect(scores).toEqual([4, 3, 2, 1]);
  });

  it("ranks the root title above a child's title and other fields", () => {
    const rows = buildChats([
      thread("title", { title: "Widget" }),
      thread("parent", { title: "Parent" }),
      thread("child", { title: "Widget", parentThreadId: "parent" }),
      thread("project"),
    ], [project("proj_a", "Widget")]);
    rows.sort((a, b) => chatSearchScore(b, "widget") - chatSearchScore(a, "widget"));
    expect(rows.map((row) => row.thread.id)).toEqual(["title", "parent", "project"]);
    expect(chatSearchScore(rows[0]!, "widget missing")).toBe(0);
  });

  it("matches words across a title and its project", () => {
    const [row] = buildChats([thread("t", { title: "Widget retry" })], [project("proj_a", "Example")]);
    expect(chatSearchScore(row!, "example retry")).toBeGreaterThan(0);
  });

  it("ranks an exact child title above an approximate root title", () => {
    const rows = buildChats([
      thread("approximate", { title: "Widgte" }),
      thread("parent", { title: "Investigation" }),
      thread("child", { title: "Widget", parentThreadId: "parent" }),
    ], []);
    rows.sort((a, b) => chatSearchScore(b, "widget") - chatSearchScore(a, "widget"));
    expect(rows.map((row) => row.thread.id)).toEqual(["parent", "approximate"]);
  });
});
