import { describe, expect, it } from "vitest";

import { createTranslator, resolveLocale } from "../lib/i18n";
import { en } from "../lib/i18n/en";
import { ru } from "../lib/i18n/ru";
import { parseSettings } from "../lib/settings";
import { laneOf, statusMessage } from "../lib/status";
import { formatChatTime } from "../lib/time";
import { NOW, thread } from "./fixtures";

describe("laneOf", () => {
  it("reads attention, working, done, and quiet", () => {
    expect(laneOf(thread("t", { hasPendingInteraction: true, status: "active" }))).toBe("attention");
    expect(laneOf(thread("t", { queuedWork: "failed" }))).toBe("attention");
    expect(laneOf(thread("t", { status: "active" }))).toBe("working");
    expect(laneOf(thread("t", { activity: { workflows: 1, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 } }))).toBe("working");
    expect(laneOf(thread("t", { indicator: "unread-success" }))).toBe("done");
    expect(laneOf(thread("t"))).toBeNull();
  });

  it("treats an unknown indicator as quiet", () => {
    expect(laneOf(thread("t", { indicator: "something-new" as never }))).toBeNull();
  });
});

describe("statusMessage", () => {
  it("names the reason a thread waits or works", () => {
    expect(statusMessage(thread("t", { queuedWork: "failed" }), "attention")).toEqual(["status.sendFailed"]);
    expect(statusMessage(thread("t", { indicator: "unread-error" }), "attention")).toEqual(["status.error"]);
    expect(statusMessage(thread("t", { runtimeStatus: "provisioning" }), "working")).toEqual(["status.provisioning"]);
    expect(
      statusMessage(
        thread("t", { activity: { workflows: 0, backgroundAgents: 3, backgroundCommands: 0, planMode: 0, goals: 0 } }),
        "working",
      ),
    ).toEqual(["status.backgroundAgents", { count: 3 }]);
  });
});

describe("i18n", () => {
  it("resolves Auto from the browser languages and falls back to English", () => {
    expect(resolveLocale("auto", ["ru-RU", "en-US"])).toBe("ru");
    expect(resolveLocale("auto", ["de-DE", "en-GB"])).toBe("en");
    expect(resolveLocale("auto", ["de-DE"])).toBe("en");
    expect(resolveLocale("ru", ["en-US"])).toBe("ru");
  });

  it("fills placeholders and picks plural forms", () => {
    const { t } = createTranslator("ru");
    expect(t("list.hiddenQuiet", { count: 1 })).toBe("Скрыт 1 спокойный чат · показать");
    expect(t("list.hiddenQuiet", { count: 3 })).toBe("Скрыто 3 спокойных чата · показать");
    expect(t("list.hiddenQuiet", { count: 11 })).toBe("Скрыто 11 спокойных чатов · показать");
    expect(createTranslator("en").t("search.nothing", { query: "x" })).toBe("Nothing matches “x”");
  });

  it("translates every message with the same placeholders", () => {
    const placeholders = (value: string | object) =>
      [...new Set([...JSON.stringify(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(ru[key]), key).toEqual(placeholders(en[key]));
    }
  });
});

describe("parseSettings", () => {
  it("maps stored option labels to ids and defends against junk", () => {
    expect(parseSettings(undefined)).toEqual({
      language: "auto",
      projects: "tabs",
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

describe("formatChatTime", () => {
  const i18n = createTranslator("en");
  it("shows a time today, Yesterday, a weekday this week, then a date", () => {
    expect(formatChatTime(NOW - 3_600_000, NOW, i18n)).toMatch(/2:00|14:00/);
    expect(formatChatTime(NOW - 86_400_000, NOW, i18n)).toBe("Yesterday");
    expect(formatChatTime(NOW - 3 * 86_400_000, NOW, i18n)).toBe("Mon");
    expect(formatChatTime(new Date(2026, 1, 3).getTime(), NOW, i18n)).toBe("Feb 3");
    expect(formatChatTime(new Date(2025, 1, 3).getTime(), NOW, i18n)).toBe("02/03/25");
    expect(formatChatTime(0, NOW, i18n)).toBe("");
  });
});
