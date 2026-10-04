// What a custom folder holds: the chats it picks and the ones it leaves out,
// with a live count of what matches right now.
import { useMemo } from "react";
import {
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders,
  type PluginSidebarProject,
} from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import { swatch } from "@/lib/colors";
import { FOLDER_SINCE, FOLDER_STATUSES, hasFilters, type FolderRule } from "@/lib/folders";
import type { MessageKey } from "@/lib/i18n";
import { matchesRule } from "@/lib/model";
import { cn } from "@/lib/utils";
import { useT } from "../chat-context";
import { useProjectColors } from "../project-colors";
import { Chip, DebouncedInput, Field, SectionTitle, toggle } from "./controls";
import type { EditorData } from "./types";

const WAIT_OPTIONS = [0, 15, 60, 240, 1440] as const;
/** Titles named under the count, so the count reads as these chats and not a number. */
const PREVIEW_TITLES = 3;

export function RuleEditor({
  rule,
  onChange,
  data,
}: {
  rule: FolderRule;
  onChange: (rule: FolderRule) => void;
  data: EditorData;
}) {
  const t = useT();
  const { colorOf } = useProjectColors();
  const { providers } = experimental_useProviders();
  const { rows, projects, sections, now } = data;
  const set = (patch: Partial<FolderRule>) => onChange({ ...rule, ...patch });

  const matching = useMemo(() => rows.filter((row) => matchesRule(row, rule, now)), [rows, rule, now]);
  const empty = !hasFilters(rule) && rule.chats.length === 0;
  // Only agents that have chats: the rest would pick nothing.
  const usedProviders = useMemo(() => {
    const ids = new Set(
      rows.flatMap((row) => [row.thread.providerId, ...row.children.map((child) => child.providerId)]),
    );
    return [...ids].map((id) => providers.find((provider) => provider.id === id) ?? { id, displayName: id });
  }, [rows, providers]);
  const titleOf = useMemo(() => {
    const titles = new Map(rows.map((row) => [row.thread.id, row.thread.displayTitle]));
    return (id: string) => titles.get(id) ?? null;
  }, [rows]);

  const projectChip = (project: PluginSidebarProject, active: boolean, onClick: () => void) => (
    <Chip key={project.id} active={active} onClick={onClick}>
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ background: swatch(colorOf(project.id, project.id)) }}
      />
      <span className="truncate">{project.isPersonal ? t("folder.personal") : project.name}</span>
    </Chip>
  );

  const handList = (ids: readonly string[], onRemove: (id: string) => void) => (
    <ul className="w-full space-y-0.5">
      {ids.map((id) => {
        const title = titleOf(id) ?? t("folders.chatGone");
        return (
          <li key={id} className="flex items-center gap-1.5 rounded-md bg-muted/60 py-1 pl-2.5 pr-1 text-xs">
            <span className={cn("min-w-0 flex-1 truncate", titleOf(id) === null && "text-muted-foreground")}>
              {title}
            </span>
            <button
              type="button"
              aria-label={t("folders.remove", { name: title })}
              title={t("folders.remove", { name: title })}
              onClick={() => onRemove(id)}
              className="grid size-5 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Icon name="X" className="size-3" />
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <div role="status" className="mx-4 mt-5 rounded-lg bg-muted/60 px-3 py-2.5 text-xs">
        {empty ? (
          <span className="text-muted-foreground">{t("folders.emptyRule")}</span>
        ) : matching.length === 0 ? (
          <span className="text-muted-foreground">{t("folders.noneYet")}</span>
        ) : (
          <>
            <span className="font-medium text-foreground">{t("folders.matching", { count: matching.length })}</span>
            <span className="mt-0.5 block truncate text-muted-foreground">
              {matching
                .slice(0, PREVIEW_TITLES)
                .map((row) => row.thread.displayTitle)
                .join(" · ")}
              {matching.length > PREVIEW_TITLES ? " …" : ""}
            </span>
          </>
        )}
      </div>

      <SectionTitle>{t("folders.include")}</SectionTitle>
      <Field title={t("folders.status")}>
        {FOLDER_STATUSES.map((status) => (
          <Chip
            key={status}
            active={rule.statuses.includes(status)}
            onClick={() => set({ statuses: toggle(rule.statuses, status) })}
          >
            {t(`folders.status.${status}` as MessageKey)}
          </Chip>
        ))}
      </Field>
      {projects.length > 0 ? (
        <Field title={t("folders.projects")}>
          {projects.map((project) =>
            projectChip(project, rule.projects.includes(project.id), () =>
              set({ projects: toggle(rule.projects, project.id) }),
            ),
          )}
        </Field>
      ) : null}
      {sections.length > 0 ? (
        <Field title={t("folders.sections")}>
          {sections.map((section) => (
            <Chip
              key={section.id}
              active={rule.sections.includes(section.id)}
              onClick={() => set({ sections: toggle(rule.sections, section.id) })}
            >
              <span className="truncate">{section.name}</span>
            </Chip>
          ))}
        </Field>
      ) : null}
      {usedProviders.length > 1 ? (
        <Field title={t("folders.providers")}>
          {usedProviders.map((provider) => (
            <Chip
              key={provider.id}
              active={rule.providers.includes(provider.id)}
              onClick={() => set({ providers: toggle(rule.providers, provider.id) })}
            >
              <ProviderIcon providerKind="agent" provider={{ id: provider.id }} className="size-3 shrink-0" />
              <span className="truncate">{provider.displayName}</span>
            </Chip>
          ))}
        </Field>
      ) : null}
      <div className="px-4 pt-3">
        <div className="pb-1.5 text-xs text-muted-foreground">{t("folders.text")}</div>
        <DebouncedInput
          label={t("folders.text")}
          value={rule.text}
          maxLength={200}
          placeholder={t("folders.textPlaceholder")}
          onCommit={(text) => set({ text })}
        />
      </div>
      <Field title={t("folders.waiting")}>
        {WAIT_OPTIONS.map((minutes) => (
          <Chip key={minutes} active={rule.waitingMinutes === minutes} onClick={() => set({ waitingMinutes: minutes })}>
            {t(`folders.wait.${minutes}` as MessageKey)}
          </Chip>
        ))}
      </Field>
      <Field title={t("folders.since")}>
        {FOLDER_SINCE.map((since) => (
          <Chip key={since} active={rule.since === since} onClick={() => set({ since })}>
            {t(`folders.since.${since}` as MessageKey)}
          </Chip>
        ))}
      </Field>
      {rule.chats.length > 0 ? (
        <Field title={t("folders.chats")}>
          {handList(rule.chats, (id) => set({ chats: rule.chats.filter((chat) => chat !== id) }))}
        </Field>
      ) : null}

      <SectionTitle>{t("folders.exclude")}</SectionTitle>
      <Field title={t("folders.status")}>
        <Chip active={rule.excludeRead} onClick={() => set({ excludeRead: !rule.excludeRead })}>
          {t("folders.excludeRead")}
        </Chip>
      </Field>
      {projects.length > 0 ? (
        <Field title={t("folders.projects")}>
          {projects.map((project) =>
            projectChip(project, rule.excludeProjects.includes(project.id), () =>
              set({ excludeProjects: toggle(rule.excludeProjects, project.id) }),
            ),
          )}
        </Field>
      ) : null}
      {rule.excludeChats.length > 0 ? (
        <Field title={t("folders.excludeChats")}>
          {handList(rule.excludeChats, (id) => set({ excludeChats: rule.excludeChats.filter((chat) => chat !== id) }))}
        </Field>
      ) : null}
      <p className="px-4 pt-4 text-[11px] leading-relaxed text-muted-foreground">{t("folders.ruleHelp")}</p>
    </>
  );
}
