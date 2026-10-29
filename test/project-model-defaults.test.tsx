// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useComposer, type ComposerSelection, type PluginComposerApi } from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot, type RenderSlotOptions } from "@get-bb/plugin-sdk/testing/app";

import app from "../app";

afterEach(cleanup);

const alpha = { providerId: "codex", model: "project-alpha", reasoningLevel: "high", permissionMode: "full", serviceTier: "fast" };
const beta = { ...alpha, providerId: "claude-code", model: "project-beta", reasoningLevel: "medium" };
type Defaults = typeof alpha | null;
type Request = { projectId: string; signal?: AbortSignal };
const execution = ({ providerId, model, reasoningLevel }: typeof alpha) => ({ providerId, model, reasoningLevel });

function deferred() {
  let resolve!: (value: Defaults) => void;
  const promise = new Promise<Defaults>((yes) => { resolve = yes; });
  return { promise, resolve };
}

async function render(
  load: (request: Request) => Promise<Defaults> = async () => alpha,
  composerOptions: RenderSlotOptions["composer"] = {},
) {
  const registration = (await loadPluginApp(app)).composerCustomizations.find((item) => item.id === "project-model-defaults");
  expect(registration?.scopes).toEqual(["new-thread"]);
  const Component = registration?.banners?.[0]?.component;
  if (Component === undefined) throw new Error("project model defaults are not registered");
  let composer!: PluginComposerApi;
  const view = renderSlot({ component: () => {
    composer = useComposer();
    return <Component />;
  } }, {}, {
    settings: { language: "English" },
    composer: {
      scope: { kind: "new-thread", projectId: "proj_a" },
      text: "Keep my prompt",
      selection: {
        projectId: "proj_a", providerId: "codex", model: "client-preference", reasoningLevel: "low",
        permissionMode: "accept-edits", serviceTier: "default",
        environment: { type: "reuse", environmentId: "env_a" },
      },
      ...composerOptions,
    },
    sdk: { projects: { defaultExecutionOptions: load } as never },
  });
  return {
    ...view,
    async pick(selection: ComposerSelection) {
      await act(async () => { await composer.setSelection(selection); });
    },
    async project(projectId: string) {
      await view.behavior.setComposerScope({ kind: "new-thread", projectId });
      await act(async () => { await composer.setSelection({ projectId }); });
    },
  };
}

describe("project model defaults", () => {
  it("overrides the client model without changing permissions, environment, tier or prompt", async () => {
    const load = vi.fn(async () => alpha);
    const view = await render(load);
    await waitFor(() => expect(view.inspection.composer.selections).toEqual([execution(alpha)]));
    expect(view.inspection.composer.selection).toMatchObject({
      ...execution(alpha), permissionMode: "accept-edits", serviceTier: "default",
      environment: { type: "reuse", environmentId: "env_a" }, projectId: "proj_a",
    });
    expect(view.inspection.composer.text).toBe("Keep my prompt");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("restores each project's own provider and model when switching and returning", async () => {
    const load = vi.fn(async ({ projectId }: Request) => projectId === "proj_a" ? alpha : beta);
    const view = await render(load);
    await waitFor(() => expect(view.inspection.composer.selection).toMatchObject(execution(alpha)));
    await view.project("proj_b");
    await waitFor(() => expect(view.inspection.composer.selection).toMatchObject(execution(beta)));
    await view.project("proj_a");
    await waitFor(() => expect(view.inspection.composer.selection).toMatchObject(execution(alpha)));
    expect(load.mock.calls.map(([request]) => request.projectId)).toEqual(["proj_a", "proj_b", "proj_a"]);
  });

  it("keeps a manual model pick after applying defaults", async () => {
    const load = vi.fn(async () => alpha);
    const view = await render(load);
    await waitFor(() => expect(view.inspection.composer.selection).toMatchObject(execution(alpha)));
    await view.pick({ providerId: "claude-code", model: "manual", reasoningLevel: "low" });
    await view.behavior.setComposerText("Edited prompt");
    expect(view.inspection.composer.selection).toMatchObject({ providerId: "claude-code", model: "manual", reasoningLevel: "low" });
    expect(load).toHaveBeenCalledTimes(1);
    expect(view.inspection.composer.selections).toHaveLength(2);
  });

  it("keeps a manual pick made while defaults were loading", async () => {
    const pending = deferred();
    const view = await render(() => pending.promise);
    await view.pick({ model: "manual", reasoningLevel: "medium" });
    await act(async () => pending.resolve(alpha));
    expect(view.inspection.composer.selection).toMatchObject({ model: "manual", reasoningLevel: "medium" });
    expect(view.inspection.composer.selections).toEqual([{ model: "manual", reasoningLevel: "medium" }]);
  });

  it("cancels old projects and ignores out-of-order responses, even on A to B to A", async () => {
    const old = deferred();
    const middle = deferred();
    let aCalls = 0;
    const load = vi.fn(({ projectId }: Request) => projectId === "proj_b" ? middle.promise : ++aCalls === 1 ? old.promise : Promise.resolve(alpha));
    const view = await render(load);
    await view.project("proj_b");
    await view.project("proj_a");
    await waitFor(() => expect(view.inspection.composer.selection).toMatchObject(execution(alpha)));
    expect(load.mock.calls[0]?.[0].signal?.aborted).toBe(true);
    expect(load.mock.calls[1]?.[0].signal?.aborted).toBe(true);
    await act(async () => { old.resolve({ ...alpha, model: "stale-a" }); middle.resolve(beta); });
    expect(view.inspection.composer.selection).toMatchObject(execution(alpha));
    expect(view.inspection.composer.selections.filter((pick) => pick.model !== undefined)).toEqual([execution(alpha)]);
  });

  it("leaves projects without saved defaults alone", async () => {
    const load = vi.fn(async () => null);
    const view = await render(load);
    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    expect(view.inspection.composer.selections).toEqual([]);
    expect(view.inspection.composer.selection?.model).toBe("client-preference");
  });

  it("shows a loading failure without changing the model, and recovers on another project", async () => {
    const load = vi.fn(async ({ projectId }: Request) => {
      if (projectId === "proj_a") throw new Error("offline");
      return beta;
    });
    const view = await render(load);
    expect((await screen.findByRole("status")).textContent).toContain("Choose a model before sending");
    expect(view.inspection.composer.selections).toEqual([]);
    await view.project("proj_b");
    await waitFor(() => expect(view.inspection.composer.selection).toMatchObject(execution(beta)));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not apply pending defaults after leaving the composer or unmounting", async () => {
    const pending = deferred();
    const view = await render(() => pending.promise);
    await view.behavior.setComposerScope({ kind: "thread", threadId: "thr_a" });
    await act(async () => pending.resolve(alpha));
    expect(view.inspection.composer.selections).toEqual([]);
    view.lifecycle.unmount();

    const another = deferred();
    const load = vi.fn((_request: Request) => another.promise);
    const unmounted = await render(load);
    unmounted.lifecycle.unmount();
    expect(load.mock.calls[0]?.[0].signal?.aborted).toBe(true);
    await act(async () => another.resolve(alpha));
    expect(unmounted.inspection.composer.selections).toEqual([]);
  });

  it("does not request defaults for existing threads or an unresolved project", async () => {
    const load = vi.fn(async () => alpha);
    await render(load, { scope: { kind: "thread", threadId: "thr_a" } });
    await render(load, { scope: { kind: "new-thread", projectId: null } });
    expect(load).not.toHaveBeenCalled();
  });
});
