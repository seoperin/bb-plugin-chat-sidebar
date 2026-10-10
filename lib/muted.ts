// Which chats bb's notifications plugin has muted, so folder badges and
// Attention can leave them out the way Telegram leaves out muted chats.
//
// bb ships no public read of the levels for many threads at once, but the
// notifications plugin keeps each thread's own level in its thread metadata
// (`{ notifications: { own } }` under the plugin id) and its defaults in its
// settings, and both are readable. The rules below mirror its resolution: a
// thread's own level, else the child-thread default for a child, else the
// default; and any ancestor's own level caps it.
//
// Pure, so tests can run it.
export type NotificationLevel = "all" | "input-only" | "muted";

export const NOTIFICATIONS_PLUGIN_ID = "push-notifications";

const RANK: Record<NotificationLevel, number> = { muted: 0, "input-only": 1, all: 2 };

function isLevel(value: unknown): value is NotificationLevel {
  return value === "all" || value === "input-only" || value === "muted";
}

export interface NotificationDefaults {
  defaultLevel: NotificationLevel;
  /** "inherit": a child thread follows `defaultLevel`. */
  childLevel: NotificationLevel | "inherit";
}

/** bb's own defaults, for when the plugin's settings cannot be read. */
export const FALLBACK_DEFAULTS: NotificationDefaults = { defaultLevel: "all", childLevel: "input-only" };

export function parseDefaults(values: Record<string, unknown> | null | undefined): NotificationDefaults {
  const defaultLevel = values?.defaultLevel;
  const childLevel = values?.childLevel;
  return {
    defaultLevel: isLevel(defaultLevel) ? defaultLevel : FALLBACK_DEFAULTS.defaultLevel,
    childLevel: isLevel(childLevel) || childLevel === "inherit" ? childLevel : FALLBACK_DEFAULTS.childLevel,
  };
}

/** A thread's own level from the notifications plugin's metadata, or null when unset. */
export function parseOwnLevel(metadata: unknown): NotificationLevel | null {
  if (metadata === null || typeof metadata !== "object") return null;
  const notifications = (metadata as { notifications?: unknown }).notifications;
  if (notifications === null || typeof notifications !== "object") return null;
  const own = (notifications as { own?: unknown }).own;
  return isLevel(own) ? own : null;
}

/** The level in effect for each thread, given own levels and parent links. */
export function effectiveLevels(
  threads: readonly { id: string; parentThreadId: string | null }[],
  own: ReadonlyMap<string, NotificationLevel>,
  defaults: NotificationDefaults,
): Map<string, NotificationLevel> {
  const parentOf = new Map(threads.map((thread) => [thread.id, thread.parentThreadId]));
  const levels = new Map<string, NotificationLevel>();
  for (const thread of threads) {
    let level =
      own.get(thread.id) ??
      (thread.parentThreadId !== null && defaults.childLevel !== "inherit"
        ? defaults.childLevel
        : defaults.defaultLevel);
    // Walk up the parents; a quieter ancestor caps the thread. The guard stops a cycle.
    const seen = new Set([thread.id]);
    for (let parent = thread.parentThreadId; parent !== null && !seen.has(parent); parent = parentOf.get(parent) ?? null) {
      seen.add(parent);
      const cap = own.get(parent);
      if (cap !== undefined && RANK[cap] < RANK[level]) level = cap;
    }
    levels.set(thread.id, level);
  }
  return levels;
}
