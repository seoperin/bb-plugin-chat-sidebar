// The backend contract: the colour picked per project and the folder layout.
// Both live in the plugin's key-value storage so every device sees them.
// Backend only: the frontend imports types from here, never values, so zod
// stays out of the app bundle.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

import { COLOR_IDS } from "./colors";
import {
  FOLDER_SINCE,
  FOLDER_STATUSES,
  MAX_CUSTOM_FOLDERS,
  MAX_NAME,
  MAX_RULE_ITEMS,
  type FolderLayout,
} from "./folders";

export { COLORS_CHANNEL } from "./colors";
export { FOLDERS_CHANNEL } from "./folders";
export const MAX_PROJECT_COLORS = 500;

const colorMap = z.record(z.string().min(1).max(200), z.enum(COLOR_IDS));

const ids = z.array(z.string().min(1).max(200)).max(MAX_RULE_ITEMS);

const ruleSchema = z
  .object({
    statuses: z.array(z.enum(FOLDER_STATUSES)).max(FOLDER_STATUSES.length),
    projects: ids,
    sections: ids,
    providers: ids,
    text: z.string().max(200),
    waitingMinutes: z
      .number()
      .int()
      .min(0)
      .max(60 * 24 * 30),
    since: z.enum(FOLDER_SINCE),
    chats: ids,
    excludeRead: z.boolean(),
    excludeProjects: ids,
    excludeChats: ids,
  })
  .strict();

const entrySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]{1,40}$/),
    kind: z.enum(["all", "attention", "archive", "projects", "sections", "custom"]),
    name: z.string().max(MAX_NAME).nullable(),
    icon: z.string().max(60).nullable(),
    color: z.enum(COLOR_IDS).nullable(),
    hidden: z.boolean(),
    rule: ruleSchema.nullable(),
  })
  .strict();

const layoutSchema = z
  .object({ version: z.literal(1), entries: z.array(entrySchema).max(MAX_CUSTOM_FOLDERS + 5) })
  .strict() satisfies z.ZodType<FolderLayout>;

const folderState = z.object({ layout: layoutSchema.nullable(), revision: z.number().int().min(0) }).strict();

export const rpcContract = defineRpcContract({
  colors_get: { input: z.null(), output: colorMap },
  colors_set: {
    input: z.object({ projectId: z.string().min(1).max(200), color: z.enum(COLOR_IDS).nullable() }).strict(),
    output: colorMap,
  },
  /** A null layout: not arranged yet, so the list derives the folders from the settings. */
  folders_get: { input: z.null(), output: folderState },
  /**
   * Saves a layout made on `baseRevision`; null goes back to the derived
   * folders. A save made on an older revision is refused (`ok: false`) with
   * the current layout, so a stale device cannot undo newer folders.
   */
  folders_set: {
    input: z.object({ layout: layoutSchema.nullable(), baseRevision: z.number().int().min(0) }).strict(),
    output: folderState.extend({ ok: z.boolean() }),
  },
  /** The layouts recent saves replaced, newest first. */
  folders_history: {
    input: z.null(),
    output: z.array(
      z.object({ revision: z.number().int(), replacedAt: z.number(), layout: layoutSchema.nullable() }).strict(),
    ),
  },
  /** Makes a layout from history current again; null when it is no longer kept. */
  folders_restore: { input: z.object({ revision: z.number().int().min(0) }).strict(), output: folderState.nullable() },
});

export type ProjectColorMap = z.infer<typeof colorMap>;
