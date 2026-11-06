// Each chat's icon. The avatar shows an icon picked from the chat's title:
// the first rule whose word or stem the title holds, else a stable icon from a
// neutral pool by a hash of the title. A pick by hand, synced by the backend
// per thread id, wins over both. The icons are the folder icons, so the
// editor's set and the chat's set are one.
// Free of zod and the SDK, so the frontend can import its values.
import { FOLDER_ICONS } from "./folders";

/** Realtime channel the backend publishes the hand-picked chat icons on. */
export const CHAT_ICONS_CHANNEL = "chat-icons";
/** Hand picks kept; the oldest go first past this. */
export const MAX_CHAT_ICONS = 2000;

/** Thread id → icon name. */
export type ChatIconMap = Record<string, string>;

export interface ChatIconState {
  revision: number;
  icons: ChatIconMap;
}

const KNOWN = new Set(FOLDER_ICONS);

export function isChatIcon(value: unknown): value is string {
  return typeof value === "string" && KNOWN.has(value);
}

export function sanitizeChatIcons(value: unknown): ChatIconMap {
  const icons: ChatIconMap = {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) return icons;
  for (const [threadId, icon] of Object.entries(value)) {
    if (threadId.length > 0 && threadId.length <= 200 && isChatIcon(icon)) icons[threadId] = icon;
  }
  return icons;
}

export function sanitizeChatIconState(value: unknown): ChatIconState {
  if (
    value !== null && typeof value === "object" &&
    "revision" in value && typeof value.revision === "number" &&
    Number.isSafeInteger(value.revision) && value.revision >= 0 && "icons" in value
  ) {
    return { revision: value.revision, icons: sanitizeChatIcons(value.icons) };
  }
  // Preserve picks saved by the original PR before revisions were introduced.
  return { revision: 0, icons: sanitizeChatIcons(value) };
}

interface Rule {
  icon: string;
  /** Whole words. */
  words?: readonly string[];
  /** A word starting with one of these: covers Russian endings. */
  stems?: readonly string[];
}

// First match wins, so the narrow rules come before the broad ones.
const RULES: readonly Rule[] = [
  { icon: "Bug", words: ["fix", "bug", "bugs"], stems: ["баг", "ошибк", "исправ", "почин", "слома", "пада", "crash", "debug", "отлад", "hotfix"] },
  { icon: "Beaker", words: ["qa", "e2e"], stems: ["тест", "test", "провер", "приёмк", "приемк", "ревью", "review", "аудит", "audit"] },
  { icon: "Lock", words: ["cve", "auth", "oauth", "2fa"], stems: ["безопас", "secur", "уязв", "секрет", "secret", "парол", "passw", "токен", "token", "доступ"] },
  { icon: "GitPullRequest", words: ["pr", "prs", "mr"], stems: ["merge", "мерж", "pull"] },
  { icon: "GitBranch", words: ["git"], stems: ["ветк", "branch", "коммит", "commit", "rebase", "worktree"] },
  { icon: "Github", stems: ["github"] },
  { icon: "chat-sidebar/rocket", stems: ["деплой", "deploy", "выкат", "выклад", "релиз", "releas", "launch", "запуск", "ship"], words: ["прод", "prod", "production"] },
  { icon: "Cloud", words: ["dns", "vps", "cdn", "hz", "k8s"], stems: ["сервер", "server", "облак", "cloud", "домен", "domain", "hetzner", "docker", "nginx", "хостинг", "hosting"] },
  { icon: "Terminal", words: ["cli", "ssh", "bash", "zsh", "tui"], stems: ["терминал", "termin", "shell", "консол", "скрипт", "script"] },
  { icon: "Bot", stems: ["бот", "bot", "агент", "agent", "herdr", "codex", "claude"] },
  { icon: "Brain", words: ["ai", "ии", "llm", "gpt", "rag"], stems: ["нейро", "neural", "модел", "model", "промпт", "prompt", "embedding"] },
  { icon: "Smartphone", words: ["ios", "app", "апп", "tg"], stems: ["мобил", "mobile", "android", "телефон", "phone", "telegram", "телеграм", "миниап", "miniapp"] },
  { icon: "Browser", words: ["web", "seo"], stems: ["сайт", "site", "лендинг", "landing", "браузер", "browser", "страниц", "page", "фронт", "front"] },
  { icon: "Plug02", words: ["api", "mcp", "sdk"], stems: ["интеграц", "integrat", "webhook", "вебхук", "плагин", "plugin", "billz"] },
  { icon: "Workflow", words: ["cron", "etl"], stems: ["workflow", "пайплайн", "pipeline", "автомат", "automat", "очеред", "queue", "поезд", "синхрон", "sync"] },
  { icon: "chat-sidebar/paint", words: ["ui", "ux", "css"], stems: ["дизайн", "design", "интерфейс", "макет", "mockup", "иконк", "icon", "цвет", "color", "colour", "тем", "theme", "вёрстк", "верстк", "анимац", "animat"] },
  { icon: "chat-sidebar/credit-card", stems: ["оплат", "платёж", "платеж", "payment", "billing", "счёт", "счет", "invoice", "касс", "фискал", "чек"] },
  { icon: "chat-sidebar/wallet", stems: ["кошел", "wallet", "крипт", "crypto", "bitcoin", "биткоин", "tangem"] },
  { icon: "chat-sidebar/coins", words: ["цена", "цены", "цен"], stems: ["деньг", "money", "бюджет", "budget", "price", "pricing", "финанс", "financ", "смет", "расход", "cost", "подписк", "тариф"] },
  { icon: "chat-sidebar/cart", words: ["store", "stores"], stems: ["магазин", "shop", "товар", "product", "заказ", "order", "корзин", "cart", "витрин", "каталог", "catalog"] },
  { icon: "chat-sidebar/chart-line", stems: ["аналит", "analyt", "отчёт", "отчет", "report", "метрик", "metric", "дашборд", "dashboard", "статист", "statist", "график", "chart", "замер", "бенчмарк", "benchmark"] },
  { icon: "chat-sidebar/briefcase", words: ["кп", "crm"], stems: ["клиент", "client", "предложен", "proposal", "оффер", "offer", "продаж", "sales", "лид", "lead", "договор", "contract", "тендер", "tender", "rfi", "rfp"] },
  { icon: "chat-sidebar/translate", stems: ["перевод", "перевес", "translat", "узбек", "uzbek", "язык", "language", "локализ", "i18n"] },
  { icon: "Mail", stems: ["письм", "email", "почт", "mail", "рассылк", "newsletter"] },
  { icon: "chat-sidebar/book-open", words: ["тз", "doc", "docs", "wiki", "вики"], stems: ["документ", "readme", "инструкц", "spec", "спек", "правил", "rule", "гайд", "guide", "мануал", "manual", "вольт", "vault", "памят", "memory"] },
  { icon: "chat-sidebar/pen", stems: ["текст", "text", "пост", "post", "стать", "article", "блог", "blog", "черновик", "draft", "редакт", "edit", "напис", "writ"] },
  { icon: "chat-sidebar/graduation", stems: ["курс", "course", "урок", "lesson", "обуч", "учеб", "learn", "лекци", "лекц", "занят", "студент"] },
  { icon: "chat-sidebar/video", stems: ["видео", "video", "ролик", "монтаж", "клип", "reel", "youtube", "ютуб"] },
  { icon: "chat-sidebar/camera", stems: ["фото", "photo", "картин", "image", "изображ", "скрин", "screenshot", "обложк", "cover", "баннер", "banner"] },
  { icon: "chat-sidebar/headphones", words: ["tts", "stt", "asr"], stems: ["музык", "music", "аудио", "audio", "звук", "sound", "голос", "voice", "подкаст", "podcast", "расшифр", "transcri", "речь", "speech"] },
  { icon: "Explore", stems: ["ресерч", "research", "исслед", "изуч", "разбер", "разбор", "анализ", "analys", "поиск", "search", "сравн", "compar", "explor", "найд", "найти", "find"] },
  { icon: "chat-sidebar/idea", words: ["идея", "идеи", "идею", "идей"], stems: ["idea", "brainstorm", "подума", "план", "plan", "стратег", "strateg", "концепц", "concept", "roadmap"] },
  { icon: "chat-sidebar/people", words: ["hr"], stems: ["команд", "team", "люд", "people", "найм", "hiring", "recruit", "вакан", "сотрудн", "собесед", "interview", "встреч", "meeting", "созвон", "call"] },
  { icon: "Calendar", stems: ["календар", "calendar", "расписан", "schedule", "дедлайн", "deadline", "срок"] },
  { icon: "Laptop", stems: ["macbook", "ноутбук", "laptop", "компьютер", "computer", "mini", "мини", "zenbook", "диск", "disk", "space"] },
  { icon: "Settings", stems: ["настро", "setting", "config", "конфиг", "установ", "install", "setup", "обновл", "update", "upgrade", "миграц", "migrat"] },
  { icon: "chat-sidebar/airplane", stems: ["поездк", "путешеств", "travel", "билет", "ticket", "flight", "рейс", "отпуск", "trip"] },
  { icon: "chat-sidebar/stethoscope", stems: ["здоров", "health", "врач", "doctor", "клиник", "clinic", "медиц", "medic", "болезн", "анализы"] },
  { icon: "chat-sidebar/dumbbell", stems: ["спорт", "sport", "трениров", "workout", "gym", "фитнес", "fitness"] },
  { icon: "chat-sidebar/restaurant", stems: ["ресторан", "restaurant", "кафе", "cafe", "рецепт", "recipe", "кухн", "food", "обед", "ужин"] },
  { icon: "chat-sidebar/map", words: ["карта", "карты", "карте", "map", "maps", "geo"], stems: ["геолок", "локац", "location", "адрес", "address", "маршрут", "route"] },
  { icon: "chat-sidebar/home", words: ["дом", "дома", "home", "house"], stems: ["семь", "family", "квартир", "apartment", "домашн"] },
  { icon: "chat-sidebar/gamepad", words: ["игра", "игры", "игру", "game", "games"], stems: ["gaming", "игров"] },
  { icon: "chat-sidebar/gift", stems: ["подар", "gift", "праздн", "holiday", "birthday"] },
];

/** Icons for a title no rule matches: neutral, distinct at avatar size. */
const POOL: readonly string[] = [
  "chat-sidebar/rocket",
  "chat-sidebar/fire",
  "chat-sidebar/trophy",
  "chat-sidebar/crown",
  "chat-sidebar/diamond",
  "chat-sidebar/flag",
  "chat-sidebar/smile",
  "chat-sidebar/sun",
  "chat-sidebar/plant",
  "chat-sidebar/idea",
  "chat-sidebar/compass",
  "chat-sidebar/mountain",
  "chat-sidebar/heart",
  "chat-sidebar/gift",
  "chat-sidebar/music",
  "chat-sidebar/paint",
  "chat-sidebar/notebook",
  "chat-sidebar/pen",
  "chat-sidebar/camera",
  "chat-sidebar/paw",
  "chat-sidebar/cat",
  "Coffee",
  "Puzzle",
  "Star",
  "Zap",
  "Target",
  "Layers",
];

function wordsOf(title: string): string[] {
  return title
    .toLocaleLowerCase()
    .replaceAll("ё", "е")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);
}

const norm = (value: string) => value.toLocaleLowerCase().replaceAll("ё", "е");

/** The rule's icon for this title, or null when no rule matches. */
export function ruleIconFor(title: string): string | null {
  const words = wordsOf(title);
  if (words.length === 0) return null;
  const set = new Set(words);
  for (const rule of RULES) {
    if (rule.words?.some((word) => set.has(norm(word)))) return rule.icon;
    if (rule.stems?.some((stem) => words.some((word) => word.startsWith(norm(stem))))) return rule.icon;
  }
  return null;
}

/** FNV-1a: the same title always lands on the same icon. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The icon a chat gets without a pick: by its title, or by its id while it has none. */
export function autoChatIcon(title: string, threadId: string): string {
  const fromRule = ruleIconFor(title);
  if (fromRule !== null) return fromRule;
  const key = wordsOf(title).join(" ") || threadId;
  return POOL[hash(key) % POOL.length]!;
}

/** Every rule icon and pool icon is a folder icon; tests hold this. */
export const RULE_ICONS: readonly string[] = [...new Set([...RULES.map((rule) => rule.icon), ...POOL])];
