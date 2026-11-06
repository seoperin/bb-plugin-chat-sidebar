// A chat row's context menu: bb's own thread menu, so it holds what bb's row
// menu does (split, copy link, read, pin, rename, archive, delete) and what
// other plugins add (per-thread notifications, moving to a section, …), plus
// this list's items for the row: folded sub-agents, the project's colour, the
// chat's icon, a new chat in the project, and reading a whole folded row. bb confirms
// deletion, and archiving a thread that has children, itself.
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  experimental_ThreadActionsContextMenu as ThreadActionsContextMenu,
  experimental_THREAD_ACTION_GROUPS as GROUPS,
  useBbNavigate,
  useSdk,
  type PluginThreadActionsInlineItem,
} from "@get-bb/plugin-sdk/app";

import { PALETTE, type ColorId } from "@/lib/colors";
import type { MessageKey } from "@/lib/i18n";
import type { Chat } from "@/lib/model";
import { laneOf } from "@/lib/status";
import { useChat, useT } from "./chat-context";
import { useChatIcons } from "./chat-icons";
import { useProjectColors } from "./project-colors";
import { useRowActions } from "./row-actions";
import { laneIcon, swatchIcon, toActionTarget } from "./thread-actions";

const MAX_SUB_AGENTS = 8;
const AUTO_COLOR = "auto";

export function ChatMenu({
  row,
  children,
  disabled,
  onOpen,
  onRename,
}: {
  row: Chat;
  children: ReactNode;
  /** While the row edits its title. */
  disabled?: boolean;
  onOpen: (threadId: string, split: boolean) => void;
  onRename: () => void;
}) {
  const t = useT();
  const { settings } = useChat();
  const sdk = useSdk();
  const navigate = useBbNavigate();
  const { colorOf, pickOf, setColor, threadColorOf, threadPickOf, setThreadColor, isRootThread } = useProjectColors();
  const { openPicker } = useRowActions();
  const chatIcons = useChatIcons();
  const { thread, project } = row;

  const inline: PluginThreadActionsInlineItem[] = [];
  const subAgents = row.children.slice(0, MAX_SUB_AGENTS);
  if (subAgents.length > 0) {
    inline.push({
      key: "sub-agents",
      group: GROUPS.open,
      action: {
        label: t("menu.subAgents"),
        icon: "Bot",
        choices: {
          items: subAgents.map((child) => ({ id: child.id, label: child.displayTitle, icon: laneIcon(laneOf(child)) })),
        },
        run: ({ value }) => {
          if (value !== undefined) onOpen(value, false);
        },
      },
    });
  }
  // bb's Mark read covers the row's own thread; a folded row is also unread
  // when one of its sub-agents is.
  const foldedUnread = row.unreadIds.filter((id) => id !== thread.id);
  if (foldedUnread.length > 0) {
    inline.push({
      key: "read-folded",
      group: GROUPS.organize,
      action: {
        label: t("menu.markFoldedRead"),
        icon: "Check",
        run: async () => {
          const results = await Promise.allSettled(row.unreadIds.map((threadId) => sdk.threads.markRead({ threadId })));
          if (results.some((result) => result.status === "rejected")) toast.error(t("toast.readFailed"));
        },
      },
    });
  }
  if (project !== null && !thread.isArchived) {
    inline.push({
      key: "new-chat",
      group: GROUPS.organize,
      action: {
        label: t("menu.newChat"),
        icon: "MessageSquarePlus",
        run: () => navigate.toCompose({ projectId: thread.projectId, focusPrompt: true }),
      },
    });
  }
  const colorChoices = (pick: ColorId | null, autoLabel: string) => ({
    items: [
      { id: AUTO_COLOR, label: autoLabel, icon: "Palette", selected: pick === null },
      ...PALETTE.map((color) => ({
        id: color.id,
        label: t(`color.${color.id}` as MessageKey),
        icon: swatchIcon(color.id),
        selected: pick === color.id,
      })),
    ],
  });
  if (isRootThread(thread)) {
    const pick = threadPickOf(thread.id);
    inline.push({
      key: "thread-color",
      group: GROUPS.settings,
      action: {
        label: t("color.threadMenu"),
        detail: pick === null ? t("color.threadAuto") : t(`color.${pick}` as MessageKey),
        icon: swatchIcon(threadColorOf(thread, project?.id ?? null).id),
        choices: colorChoices(pick, t("color.threadAuto")),
        run: ({ value }) => {
          if (value === undefined) return;
          const color = PALETTE.find((candidate) => candidate.id === value);
          setThreadColor(thread.id, color?.id ?? null);
        },
      },
    });
  }
  if (project !== null) {
    const pick = pickOf(project.id);
    const current = colorOf(project.id, project.id);
    inline.push({
      key: "project-color",
      group: GROUPS.settings,
      action: {
        label: t("color.menu"),
        detail: pick === null ? t("color.auto") : t(`color.${pick}` as MessageKey),
        icon: swatchIcon(current.id),
        choices: colorChoices(pick, t("color.auto")),
        run: ({ value }) => {
          if (value === undefined) return;
          const color = PALETTE.find((candidate) => candidate.id === value);
          setColor(project.id, color?.id ?? null);
        },
      },
    });
  }

  if (settings.avatar === "icon") {
    inline.push({
      key: "chat-icon",
      group: GROUPS.settings,
      action: {
        label: t("menu.chatIcon"),
        detail: chatIcons.pickOf(thread.id) === null ? t("chatIcon.autoShort") : undefined,
        icon: chatIcons.iconOf(thread.id, thread.displayTitle),
        run: () => chatIcons.openPicker({ id: thread.id, title: thread.displayTitle }),
      },
    });
  }

  inline.push({
    key: "row-actions",
    group: GROUPS.settings,
    action: { label: t("menu.rowActions"), icon: "SlidersHorizontal", run: openPicker },
  });

  return (
    <ThreadActionsContextMenu
      thread={toActionTarget(thread)}
      inline={inline}
      requestRename={onRename}
      disabled={disabled}
    >
      {children}
    </ThreadActionsContextMenu>
  );
}
