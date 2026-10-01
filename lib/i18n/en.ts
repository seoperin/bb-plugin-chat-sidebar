// English strings — the source of truth for every message the list shows.
// Other languages implement the same `Messages` shape, so a missing key is a
// type error rather than a blank label.
//
// `{name}` placeholders are filled by `format`; counted messages take a
// `count` and pick the plural form through `Intl.PluralRules`.

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export const en = {
  // Folders
  "folder.all": "All",
  "folder.attention": "Attention",
  "folder.archive": "Archive",
  "folder.personal": "Personal",
  "folder.pinned": "Pinned",
  "folder.other": "Other",
  "folder.tabs": "Folders",
  "folder.hasWaiting": "Something is waiting for you",
  "folder.hasWorking": "Something is working",
  "folder.markRead": "Mark all as read · {count}",
  "folder.allRead": "Everything is read",
  "folder.newChat": "New chat in this project",
  "folder.newChatSection": "New chat in this section",
  "folder.collapse": "Collapse {name}",
  "folder.expand": "Expand {name}",

  // Search
  "search.placeholder": "Search chats",
  "search.label": "Search chats",
  "search.clear": "Clear search",
  "search.nothing": "Nothing matches “{query}”",

  // List states
  "list.label": "Chats",
  "list.loading": "Loading chats…",
  "list.error": "Couldn't load chats.",
  "list.empty": "No chats here yet",
  "list.emptyAttention": "Nothing needs you right now",
  "list.archiveEmpty": "The archive is empty",
  "list.archiveLoading": "Loading the archive…",
  "list.loadMore": "Show more",
  "list.toTop": "Back to top",
  "list.loadingMore": "Loading…",
  "list.hiddenQuiet": {
    one: "{count} quiet chat hidden · Show",
    other: "{count} quiet chats hidden · Show",
  },

  // Row
  "row.pinned": "Pinned",
  "row.unread": "Unread",
  "row.draft": "Draft",
  "row.subAgents": { one: "+{count} sub-agent", other: "+{count} sub-agents" },

  // Status
  "status.done": "Done",
  "status.doneLong": "Done, not viewed yet",
  "status.waiting": "Needs you",
  "status.waitingReply": "Waiting for your reply",
  "status.sendFailed": "Message failed to send",
  "status.error": "Stopped with an error",
  "status.working": "Working",
  "status.provisioning": "Preparing the environment",
  "status.hostReconnecting": "Machine reconnecting",
  "status.waitingForHost": "Waiting for the machine",
  "status.starting": "Starting",
  "status.stopping": "Stopping",
  "status.workflow": "Running a workflow",
  "status.planning": "Planning",
  "status.goal": "Working on a goal",
  "status.backgroundAgents": { one: "{count} background agent", other: "{count} background agents" },
  "status.backgroundCommand": "Background command",
  "status.queued": "Working, message queued",

  // Time
  "time.yesterday": "Yesterday",

  // Menu
  "menu.open": "Open",
  "menu.openSplit": "Open in split",
  "menu.splitHint": "{key} click",
  "menu.rename": "Rename",
  "menu.pin": "Pin",
  "menu.unpin": "Unpin",
  "menu.markRead": "Mark as read",
  "menu.markUnread": "Mark as unread",
  "menu.copyLink": "Copy link",
  "menu.archive": "Archive",
  "menu.unarchive": "Restore from archive",
  "menu.delete": "Delete…",
  "menu.newChat": "New chat in this project",
  "menu.subAgents": "Sub-agents",

  // Rename
  "rename.label": "Chat title",

  // Toasts
  "toast.linkCopied": "Link copied",
  "toast.linkFailed": "Couldn't copy the link",
  "toast.pinFailed": "Couldn't pin the chat",
  "toast.unpinFailed": "Couldn't unpin the chat",
  "toast.readFailed": "Couldn't update the chat",
  "toast.renameFailed": "Couldn't rename the chat",
  "toast.unarchiveFailed": "Couldn't restore the chat",
  "toast.reorderFailed": "Couldn't move the chat",
  "toast.markReadFailed": "Couldn't mark {failed} of {total} as read",
} satisfies Record<string, string | PluralForms>;

export type MessageKey = keyof typeof en;
export type Messages = { [Key in MessageKey]: (typeof en)[Key] extends string ? string : PluralForms };
