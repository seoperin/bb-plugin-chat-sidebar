import type { Chat } from "./model";

/** Treat title separators, letter/number boundaries, case and ё/е alike. */
export function normalizeSearch(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase().replace(/ё/g, "е")
    .replace(/([\p{L}])(\p{N})/gu, "$1 $2")
    .replace(/(\p{N})([\p{L}])/gu, "$1 $2")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** One insertion, deletion, replacement or adjacent transposition. */
function oneTypo(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (left[i] === right[j + 1] && left[i + 1] === right[j]) { i += 2; j += 2; }
    else if (left.length > right.length) i++;
    else if (right.length > left.length) j++;
    else { i++; j++; }
  }
  return edits + left.length - i + right.length - j <= 1;
}

/** Exact title, prefix, phrase, words, then one typo in a word of 5+ letters. */
export function titleSearchScore(title: string, query: string): number {
  const needle = normalizeSearch(query);
  if (needle === "") return 0;
  const text = normalizeSearch(title);
  if (text === needle) return 4;
  if (text.startsWith(needle)) return 3;
  if (text.includes(needle)) return 2;
  const words = needle.split(" ");
  if (words.every((word) => text.includes(word))) return 1;
  const titleWords = text.split(" ");
  return words.every((word) => text.includes(word) || /^\p{L}{5,}$/u.test(word) &&
    titleWords.some((candidate) => /^\p{L}{5,}$/u.test(candidate) && oneTypo(word, candidate))) ? 0.5 : 0;
}

/** Title quality first; the row's own title wins ties, metadata follows titles. */
export function chatSearchScore(row: Chat, query: string): number {
  const needle = normalizeSearch(query);
  if (needle === "") return 0;
  const title = titleSearchScore(row.thread.displayTitle, needle);
  const child = Math.max(0, ...row.children.map((thread) => titleSearchScore(thread.displayTitle, needle)));
  const titleRank = Math.max(title > 0 ? title * 10 + 4 : 0, child > 0 ? child * 10 + 3 : 0);
  if (titleRank > 0) return titleRank;
  const branch = titleSearchScore(row.thread.environment?.branchName ?? "", needle);
  if (branch > 0) return 4;
  const project = titleSearchScore(row.project?.name ?? "", needle);
  if (project > 0) return 2;
  const combined = normalizeSearch([
    row.thread.displayTitle, row.project?.name ?? "", row.thread.environment?.branchName ?? "",
    ...row.children.map((thread) => thread.displayTitle),
  ].join(" "));
  return needle.split(" ").every((word) => combined.includes(word)) ? 1 : 0;
}
