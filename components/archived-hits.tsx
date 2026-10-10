// Archived chats the message search found, under the results: bb loads the
// archive into the list only page by page, so these rows are drawn from what
// the search returned and open the thread directly. A few at first, the rest
// one click away.
import { useState } from "react";
import { experimental_ProviderIcon as ProviderIcon, type PluginSidebarProject } from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import type { ArchivedHit } from "@/hooks/use-message-search";
import { avatarBackground } from "@/lib/colors";
import { initialOf } from "@/lib/model";
import { formatChatTime } from "@/lib/time";
import { useChat } from "./chat-context";
import { Snippet } from "./chat-row";
import { useProjectColors } from "./project-colors";

const FIRST = 5;

export function ArchivedHits({
  hits,
  projects,
  now,
  onOpen,
}: {
  hits: readonly ArchivedHit[];
  projects: readonly PluginSidebarProject[];
  now: number;
  onOpen: (threadId: string, split: boolean) => void;
}) {
  const { i18n } = useChat();
  const { t } = i18n;
  const { colorOf } = useProjectColors();
  const [all, setAll] = useState(false);
  if (hits.length === 0) return null;
  const shown = all ? hits : hits.slice(0, FIRST);
  const projectName = (id: string) => {
    const project = projects.find((candidate) => candidate.id === id);
    if (project === undefined) return null;
    return project.isPersonal ? t("folder.personal") : project.name;
  };
  return (
    <section aria-label={t("search.archived", { count: hits.length })} className="mt-2">
      <h3 className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">
        <Icon name="Archive" className="size-3" />
        {t("search.archived", { count: hits.length })}
      </h3>
      <ul className="space-y-px">
        {shown.map((hit) => {
          const project = projectName(hit.projectId);
          const where = [project, hit.branch].filter((part): part is string => part !== null && part !== "");
          return (
            <li key={hit.id} className="list-none">
              <a
                href={`/projects/${hit.projectId}/threads/${hit.id}`}
                data-chat-anchor=""
                onClick={(event) => {
                  if (event.button !== 0 || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  onOpen(hit.id, event.metaKey || event.ctrlKey);
                }}
                className="flex select-none items-start gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-sidebar-foreground no-underline outline-none hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white opacity-80"
                  style={{ background: avatarBackground(colorOf(hit.projectId, hit.projectId)) }}
                >
                  {initialOf(project ?? hit.title)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate font-medium">{hit.title}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {formatChatTime(hit.updatedAt, now, i18n)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <ProviderIcon providerKind="agent" provider={{ id: hit.providerId }} className="size-3 shrink-0" />
                    {where.length > 0 ? <span className="min-w-0 truncate">{where.join(" · ")}</span> : null}
                  </span>
                  {hit.match !== null ? <Snippet match={hit.match} /> : null}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      {!all && hits.length > FIRST ? (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="mx-auto mt-1 block cursor-pointer rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
        >
          {t("search.archivedMore", { count: hits.length - FIRST })}
        </button>
      ) : null}
    </section>
  );
}
