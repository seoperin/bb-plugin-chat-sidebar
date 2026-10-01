// A tiny translator: no runtime dependency, typed keys, plural forms through
// `Intl.PluralRules`. bb has no locale API for plugins, so "Auto" follows the
// browser's language list and falls back to English.
//
// To add a language: copy `ru.ts`, translate it, and add it to `CATALOGS`
// and to `LANGUAGE_OPTIONS` in `lib/settings.ts`.
import type { Language } from "../settings";
import { en, type MessageKey, type Messages, type PluralForms } from "./en";
import { ru } from "./ru";

export type Locale = "en" | "ru";
export type { MessageKey };

const CATALOGS: Record<Locale, Messages> = { en, ru };

export function resolveLocale(language: Language, preferred: readonly string[]): Locale {
  if (language !== "auto") return language;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (base !== undefined && Object.hasOwn(CATALOGS, base)) return base as Locale;
  }
  return "en";
}

export type Params = Record<string, string | number>;

export interface Translator {
  locale: Locale;
  t(key: MessageKey, params?: Params): string;
}

function fill(template: string, params: Params | undefined): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

export function createTranslator(locale: Locale): Translator {
  const messages = CATALOGS[locale];
  const plurals = new Intl.PluralRules(locale);
  return {
    locale,
    t(key, params) {
      const message: string | PluralForms = messages[key] ?? en[key];
      if (typeof message === "string") return fill(message, params);
      const count = typeof params?.count === "number" ? params.count : 0;
      return fill(message[plurals.select(count)] ?? message.other, params);
    },
  };
}
