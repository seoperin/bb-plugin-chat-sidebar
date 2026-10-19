// Experimental: a picture in place of a folder's icon, like a Discord server's.
//
// Pictures are keyed by the folder's id (`attention`, `project:<id>`,
// `custom:<id>`, …), not kept in the layout: a project's or section's folder
// has no entry of its own, and the layout's history stays small. The list
// crops and shrinks a picture before it is saved, so what is stored is a small
// square data URL, one storage key per folder.
//
// No zod here: the list imports this file.

/** Realtime channel the backend publishes every folder's picture on. */
export const FOLDER_IMAGES_CHANNEL = "folder-images";

/** folder id → `data:image/…;base64,…` */
export type FolderImageMap = Record<string, string>;

/** The side of the stored square: the icons-only rail's 40px at 3x. */
export const FOLDER_IMAGE_SIZE = 128;
/** Far above what a 128px square needs, so only garbage is refused. */
export const MAX_FOLDER_IMAGE_LENGTH = 200_000;
export const MAX_FOLDER_IMAGES = 300;

const DATA_URL = /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/]+=*$/;

export function isFolderImage(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_FOLDER_IMAGE_LENGTH && DATA_URL.test(value);
}

export function sanitizeFolderImages(value: unknown): FolderImageMap {
  const images: FolderImageMap = {};
  if (value === null || typeof value !== "object") return images;
  for (const [folderId, image] of Object.entries(value)) {
    if (isFolderImage(image)) images[folderId] = image;
  }
  return images;
}

/** The folder a layout entry stands for; null for the per-project and per-section generators. */
export function entryFolderId(entry: { id: string; kind: string }): string | null {
  if (entry.kind === "projects" || entry.kind === "sections") return null;
  return entry.kind === "custom" ? `custom:${entry.id}` : entry.id;
}
