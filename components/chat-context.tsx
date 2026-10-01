// Settings and the translator, read once at the top of the list and shared
// with every row through context.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useSettings } from "@get-bb/plugin-sdk/app";

import { createTranslator, resolveLocale, type Translator } from "@/lib/i18n";
import { parseSettings, type ChatSettings } from "@/lib/settings";

interface ChatContextValue {
  settings: ChatSettings;
  i18n: Translator;
}

const ChatContext = createContext<ChatContextValue | null>(null);

function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { values } = useSettings();
  const value = useMemo(() => {
    const settings = parseSettings(values);
    return { settings, i18n: createTranslator(resolveLocale(settings.language, browserLanguages())) };
  }, [values]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const value = useContext(ChatContext);
  if (value === null) throw new Error("useChat() must be used inside <ChatProvider>");
  return value;
}

export function useT(): Translator["t"] {
  return useChat().i18n.t;
}
