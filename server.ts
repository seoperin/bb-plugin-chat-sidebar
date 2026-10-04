// bb-plugin-chat-sidebar — backend. The list lives in the frontend; the
// backend declares the settings bb shows on the plugin's page and keeps what
// syncs across devices: the colour picked for each project and the folders.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { isColorId } from "./lib/colors";
import { layoutWithSettings, settingsPatchFor, type LegacyFolderSettings } from "./lib/folder-settings";
import { createFolderStore } from "./lib/folder-store";
import { COLORS_CHANNEL, FOLDERS_CHANNEL, MAX_PROJECT_COLORS, rpcContract, type ProjectColorMap } from "./lib/rpc";
import { SETTINGS } from "./lib/settings";

const COLORS_KEY = "project-colors";

export default function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define(SETTINGS);

  const read = async (): Promise<ProjectColorMap> => {
    const stored = await bb.storage.kv.get<Record<string, unknown>>(COLORS_KEY);
    const colors: ProjectColorMap = {};
    for (const [projectId, color] of Object.entries(stored ?? {})) {
      if (isColorId(color)) colors[projectId] = color;
    }
    return colors;
  };

  // Colour writes run one after another, so two quick picks never lose each other.
  let queue: Promise<unknown> = Promise.resolve();
  const writeColors = (change: (colors: ProjectColorMap) => void): Promise<ProjectColorMap> => {
    const write = queue.then(async () => {
      const colors = await read();
      change(colors);
      const ids = Object.keys(colors);
      if (ids.length > MAX_PROJECT_COLORS) {
        for (const id of ids.slice(0, ids.length - MAX_PROJECT_COLORS)) delete colors[id];
      }
      await bb.storage.kv.set(COLORS_KEY, colors);
      bb.realtime.publish(COLORS_CHANNEL, colors);
      return colors;
    });
    queue = write.catch(() => undefined);
    return write;
  };

  // --- folders, and the settings that predate the folder editor

  const legacy = (values: Awaited<ReturnType<typeof settings.get>>): LegacyFolderSettings => ({
    projects: values.projects,
    sectionFolders: values.sectionFolders,
    archiveFolder: values.archiveFolder,
  });

  // The layout and the settings change each other, so both directions run one
  // at a time and read what is current when they run, not what set them off.
  let syncQueue: Promise<unknown> = Promise.resolve();
  const inStep = (task: () => Promise<void>, failure: string) => {
    syncQueue = syncQueue.then(task).catch((cause: unknown) => bb.log.warn(`${failure}: ${String(cause)}`));
  };
  // Settings written here to follow the layout, until their change comes back:
  // that change is not the user's and must not move the layout again.
  const ownWrites: string[] = [];
  const keyOf = (values: LegacyFolderSettings) =>
    JSON.stringify([values.projects, values.sectionFolders, values.archiveFolder]);

  /** A saved layout puts "Projects", "Section folders" and "Archive folder" in step with it. */
  const syncSettings = () =>
    inStep(async () => {
      const { layout } = await folders.get();
      // Without a saved layout the folders are derived from the settings: nothing to sync.
      if (layout === null) return;
      const current = legacy(await settings.get());
      const patch = settingsPatchFor(layout, current);
      if (patch === null) return;
      const expected = keyOf({ ...current, ...patch });
      ownWrites.push(expected);
      try {
        await settings.experimental_set(patch);
      } catch (cause) {
        ownWrites.splice(ownWrites.indexOf(expected), 1);
        throw cause;
      }
    }, "folder settings not synced");

  const folders = createFolderStore(bb.storage.kv, (state) => {
    bb.realtime.publish(FOLDERS_CHANNEL, state);
    syncSettings();
  });

  // And the other way: a setting changed on bb's settings page shows or hides the folder.
  settings.onChange((next, prev) => {
    if (keyOf(legacy(next)) === keyOf(legacy(prev))) return;
    const own = ownWrites.indexOf(keyOf(legacy(next)));
    if (own !== -1) {
      ownWrites.splice(0, own + 1);
      return;
    }
    inStep(async () => {
      // A save from the editor can land between reading and writing: try again on it.
      for (let attempt = 0; attempt < 3; attempt++) {
        const state = await folders.get();
        if (state.layout === null) return;
        const layout = layoutWithSettings(state.layout, legacy(await settings.get()));
        if (layout === null || (await folders.save(layout, state.revision)).ok) return;
      }
    }, "folders not updated from settings");
  });

  bb.rpc.register(rpcContract, {
    folders_get: () => folders.get(),
    folders_set: ({ layout, baseRevision }) => folders.save(layout, baseRevision),
    folders_history: () => folders.history(),
    folders_restore: ({ revision }) => folders.restore(revision),
    colors_get: () => read(),
    colors_set: ({ projectId, color }) =>
      writeColors((colors) => {
        if (color === null) delete colors[projectId];
        else colors[projectId] = color;
      }),
  });
}
