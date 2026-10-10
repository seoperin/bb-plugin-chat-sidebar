// The quick buttons a row shows on hover: bb thread action keys
// (`<owner>/<id>`) in the order the row shows them, synced by the backend.
// Free of zod and the SDK, so the frontend can import its values.

/** Realtime channel the backend publishes the row's quick buttons on. */
export const ROW_ACTIONS_CHANNEL = "row-actions";
export const MAX_ROW_ACTIONS = 3;

export function sanitizeRowActions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const keys = value.filter((key): key is string => typeof key === "string" && key.includes("/"));
  return [...new Set(keys)].slice(0, MAX_ROW_ACTIONS);
}
