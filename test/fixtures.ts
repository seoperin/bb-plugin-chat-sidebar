import type { PluginSidebarProject, PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export const NOW = new Date(2026, 9, 1, 15, 0).getTime();

export function thread(id: string, overrides: Partial<PluginSidebarThread> = {}): PluginSidebarThread {
  return {
    id,
    projectId: "proj_a",
    title: id,
    titleFallback: null,
    displayTitle: overrides.title ?? id,
    parentThreadId: null,
    lifecycleOwnerThreadId: null,
    sourceThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "claude-code",
    status: "idle",
    runtimeStatus: "idle",
    queuedWork: "none",
    hasPendingInteraction: false,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    pinnedAt: null,
    pinSortKey: null,
    isArchived: false,
    archivedAt: null,
    href: `/projects/proj_a/threads/${id}`,
    isHidden: false,
    environment: null,
    host: null,
    createdAt: NOW - 3_600_000,
    updatedAt: NOW - 3_600_000,
    lastReadAt: null,
    latestAttentionAt: 0,
    ...overrides,
  } as PluginSidebarThread;
}

export function project(id: string, name: string, isPersonal = false): PluginSidebarProject {
  return { id, name, isPersonal, href: `/projects/${id}`, settingsHref: `/projects/${id}/settings` };
}
