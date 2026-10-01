// Per-viewer conveniences in localStorage: the open folder and collapsed
// headings. Storage can be missing (private windows, blocked site data) or
// hold anything, so reads validate and every access is guarded; without it
// these are simply not remembered.

export function readStored<T>(key: string, parse: (raw: string) => T | undefined, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return parse(raw) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

/** A JSON array of strings, or undefined for anything else. */
export function parseStringArray(raw: string): string[] | undefined {
  const value: unknown = JSON.parse(raw);
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}
