import { describe, expect, it } from "vitest";

import { RULE_ICONS, autoChatIcon, isChatIcon, ruleIconFor, sanitizeChatIcons } from "../lib/chat-icons";
import { FOLDER_ICONS } from "../lib/folders";
import { rpcContract } from "../lib/rpc";

describe("chat icon from the title", () => {
  it.each([
    ["Исправить падение при запуске", "Bug"],
    ["Fix login crash", "Bug"],
    ["Тесты для оплаты", "Beaker"],
    ["Деплой на прод", "chat-sidebar/rocket"],
    ["Настроить DNS на сервере", "Cloud"],
    ["Телеграм мини апп магазина", "Smartphone"],
    ["Оплата через Payme", "chat-sidebar/credit-card"],
    ["Отчёт по продажам за октябрь", "chat-sidebar/chart-line"],
    ["КП для клиента", "chat-sidebar/briefcase"],
    ["Переведи на узбекский", "chat-sidebar/translate"],
    ["Пост в канал", "chat-sidebar/pen"],
    ["Ресерч рынка TTS", "chat-sidebar/headphones"],
    ["Изучи конкурентов", "Explore"],
    ["Chat Sidebar plugin bb", "Plug02"],
  ])("%s → %s", (title, icon) => {
    expect(ruleIconFor(title)).toBe(icon);
  });

  it("matches whole short words only", () => {
    expect(ruleIconFor("Средам и победам")).toBeNull();
    expect(ruleIconFor("Продажи")).toBe("chat-sidebar/briefcase");
    expect(ruleIconFor("storage cleanup")).not.toBe("chat-sidebar/cart");
  });

  it("gives an unmatched title the same pool icon every time", () => {
    const title = "Ёлка и снеговик";
    expect(ruleIconFor(title)).toBeNull();
    expect(autoChatIcon(title, "a")).toBe(autoChatIcon(title, "b"));
    expect(autoChatIcon("  ЁЛКА  и снеговик! ", "c")).toBe(autoChatIcon(title, "a"));
  });

  it("falls back to the thread id for an empty title", () => {
    expect(isChatIcon(autoChatIcon("", "thr_1"))).toBe(true);
  });

  it("uses only icons the picker offers", () => {
    for (const icon of RULE_ICONS) expect(FOLDER_ICONS).toContain(icon);
  });
});

describe("hand-picked chat icons", () => {
  it("drops unknown icons and bad ids", () => {
    expect(sanitizeChatIcons({ a: "Bug", b: "NoSuchIcon", "": "Bug", c: 5 })).toEqual({ a: "Bug" });
    expect(sanitizeChatIcons(null)).toEqual({});
    expect(sanitizeChatIcons(["Bug"])).toEqual({});
  });

  it("validates the RPC input", () => {
    const parse = (icon: unknown) => rpcContract.chaticons_set.input.safeParse({ threadId: "thr_1", icon });
    expect(parse("chat-sidebar/rocket").success).toBe(true);
    expect(parse(null).success).toBe(true);
    expect(parse("javascript:alert(1)").success).toBe(false);
  });
});
