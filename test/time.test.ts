import { describe, expect, it } from "vitest";

import { createTranslator } from "../lib/i18n";
import { formatChatTime } from "../lib/time";
import { NOW } from "./fixtures";

describe("formatChatTime", () => {
  const i18n = createTranslator("en");
  it("shows a time today, Yesterday, a weekday this week, then a date", () => {
    expect(formatChatTime(NOW - 3_600_000, NOW, i18n)).toBe("2:00 PM");
    expect(formatChatTime(NOW - 86_400_000, NOW, i18n)).toBe("Yesterday");
    expect(formatChatTime(NOW - 3 * 86_400_000, NOW, i18n)).toBe("Mon");
    expect(formatChatTime(new Date(2026, 1, 3).getTime(), NOW, i18n)).toBe("Feb 3");
    expect(formatChatTime(new Date(2025, 1, 3).getTime(), NOW, i18n)).toBe("02/03/25");
    expect(formatChatTime(0, NOW, i18n)).toBe("");
  });
});
