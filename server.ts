// bb-plugin-chat-sidebar — backend. The list lives in the frontend; the
// backend declares the settings bb shows on the plugin's page and keeps the
// colour picked for each project.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { isColorId } from "./lib/colors";
import { COLORS_CHANNEL, MAX_PROJECT_COLORS, rpcContract, type ProjectColorMap } from "./lib/rpc";
import { SETTINGS } from "./lib/settings";

const COLORS_KEY = "project-colors";

export default function plugin(bb: BbPluginApi) {
  bb.settings.define(SETTINGS);

  const read = async (): Promise<ProjectColorMap> => {
    const stored = await bb.storage.kv.get<Record<string, unknown>>(COLORS_KEY);
    const colors: ProjectColorMap = {};
    for (const [projectId, color] of Object.entries(stored ?? {})) {
      if (isColorId(color)) colors[projectId] = color;
    }
    return colors;
  };

  // Writes run one after another, so two quick picks never lose each other.
  let queue: Promise<unknown> = Promise.resolve();

  bb.rpc.register(rpcContract, {
    colors_get: () => read(),
    colors_set: ({ projectId, color }) => {
      const write = queue.then(async () => {
        const colors = await read();
        if (color === null) delete colors[projectId];
        else colors[projectId] = color;
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
    },
  });
}
