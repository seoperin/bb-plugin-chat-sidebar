import { describe, expect, it } from "vitest";

import { createTranslator, resolveLocale } from "../lib/i18n";
import { en } from "../lib/i18n/en";
import { ru } from "../lib/i18n/ru";

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
