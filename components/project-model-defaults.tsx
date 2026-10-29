import { useEffect, useState } from "react";
import { useComposer, useSdk } from "@get-bb/plugin-sdk/app";

import { ChatProvider, useT } from "./chat-context";

/** Project defaults take precedence over bb's client-wide model preference. */
function ApplyProjectModelDefaults() {
  const composer = useComposer();
  const sdk = useSdk();
  const t = useT();
  const projectId = composer.scope.kind === "new-thread" ? composer.scope.projectId : null;
  const hasProjectSelection = projectId !== null && composer.selection?.projectId === projectId;
  const [failedProject, setFailedProject] = useState<string | null>(null);

  useEffect(() => {
    if (projectId === null || !hasProjectSelection) return;
    const controller = new AbortController();
    const initial = composer.selection;
    setFailedProject(null);

    const apply = async () => {
      const defaults = await sdk.projects.defaultExecutionOptions({ projectId, signal: controller.signal });
      if (controller.signal.aborted || defaults === null || composer.isSubmitting) return;
      const current = composer.selection;
      // A late response must not undo a project switch or a manual model pick.
      if (
        composer.scope.kind !== "new-thread" ||
        composer.scope.projectId !== projectId ||
        current?.projectId !== projectId ||
        current.providerId !== initial?.providerId ||
        current.model !== initial?.model ||
        current.reasoningLevel !== initial?.reasoningLevel
      ) return;
      const { providerId, model, reasoningLevel } = defaults;
      if (current.providerId === providerId && current.model === model && current.reasoningLevel === reasoningLevel) return;
      await composer.setSelection({ providerId, model, reasoningLevel });
    };

    void apply().catch(() => {
      if (!controller.signal.aborted) setFailedProject(projectId);
    });
    return () => controller.abort();
  }, [composer, sdk, projectId, hasProjectSelection]);

  return failedProject === projectId && projectId !== null ? (
    <p role="status" className="px-3 text-xs text-muted-foreground">{t("newChat.modelDefaultsFailed")}</p>
  ) : null;
}

export function ProjectModelDefaults() {
  return <ChatProvider><ApplyProjectModelDefaults /></ChatProvider>;
}
