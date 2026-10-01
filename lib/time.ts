// Messenger time: "14:05" today, "Yesterday", a weekday within the week,
// then a short date. Formatting follows the list's locale.
import type { Translator } from "./i18n";

const DAY = 86_400_000;

export function formatChatTime(at: number, now: number, { locale, t }: Translator): string {
  if (at <= 0) return "";
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const date = new Date(at);
  if (at >= startOfToday) {
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  if (at >= startOfToday - DAY) return t("time.yesterday");
  if (at >= startOfToday - 6 * DAY) return date.toLocaleDateString(locale, { weekday: "short" });
  if (date.getFullYear() === today.getFullYear()) {
    return date.toLocaleDateString(locale, { day: "numeric", month: "short" });
  }
  return date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "2-digit" });
}
