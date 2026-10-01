// The backend contract. The only shared state is the colour picked per
// project; it lives in the plugin's key-value storage so every device sees it.
// Backend only: the frontend imports types from here, never values, so zod
// stays out of the app bundle.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

import { COLOR_IDS } from "./colors";

export { COLORS_CHANNEL } from "./colors";
export const MAX_PROJECT_COLORS = 500;

const colorMap = z.record(z.string().min(1).max(200), z.enum(COLOR_IDS));

export const rpcContract = defineRpcContract({
  colors_get: { input: z.null(), output: colorMap },
  colors_set: {
    input: z.object({ projectId: z.string().min(1).max(200), color: z.enum(COLOR_IDS).nullable() }).strict(),
    output: colorMap,
  },
});

export type ProjectColorMap = z.infer<typeof colorMap>;
