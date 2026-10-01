// Project colours: twelve hues far enough apart to tell at avatar size in
// both themes, with white letters readable on all of them.
//
// Projects without a chosen colour get one automatically, from the clearest
// colours first: with a handful of projects that means blue, red, green,
// orange, violet, teal; the in-between hues join only when there are more
// projects. Each project starts from a slot picked by its id and moves to the
// next free one, so up to twelve projects never share a colour. A colour the
// user picked always wins.

export const PALETTE = [
  { id: "red", hue: 4, sat: 70, light: 52 },
  { id: "orange", hue: 24, sat: 82, light: 50 },
  { id: "amber", hue: 40, sat: 92, light: 50 },
  { id: "lime", hue: 96, sat: 52, light: 44 },
  { id: "green", hue: 145, sat: 52, light: 40 },
  { id: "teal", hue: 172, sat: 60, light: 37 },
  { id: "cyan", hue: 194, sat: 72, light: 43 },
  { id: "blue", hue: 214, sat: 75, light: 52 },
  { id: "indigo", hue: 238, sat: 58, light: 58 },
  { id: "violet", hue: 266, sat: 58, light: 56 },
  { id: "magenta", hue: 300, sat: 46, light: 48 },
  { id: "pink", hue: 336, sat: 68, light: 54 },
] as const;

export type ColorId = (typeof PALETTE)[number]["id"];

/** Automatic colours, most distinct first. */
const AUTO_ORDER: readonly ColorId[] = [
  "blue",
  "red",
  "green",
  "orange",
  "violet",
  "teal",
  "pink",
  "amber",
  "indigo",
  "cyan",
  "lime",
  "magenta",
];
const MIN_AUTO_COLORS = 6;
export type PaletteColor = (typeof PALETTE)[number];

export const COLOR_IDS = PALETTE.map((color) => color.id) as unknown as readonly [ColorId, ...ColorId[]];

const BY_ID = new Map<string, PaletteColor>(PALETTE.map((color) => [color.id, color]));

export function isColorId(value: unknown): value is ColorId {
  return typeof value === "string" && BY_ID.has(value);
}

export function colorById(id: ColorId): PaletteColor {
  return BY_ID.get(id) ?? PALETTE[0];
}

function hash(key: string): number {
  let value = 0;
  for (const char of key) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

/** A colour for something with no project: stable per key, not deduplicated. */
export function colorForKey(key: string): PaletteColor {
  return PALETTE[hash(key) % PALETTE.length] ?? PALETTE[0];
}

/**
 * Colour per project: the user's pick first, then automatic colours that avoid
 * every colour already taken while any is free. Deterministic for a given
 * set of projects and picks.
 */
export function assignProjectColors(
  projectIds: readonly string[],
  picks: Readonly<Record<string, ColorId>>,
): Map<string, PaletteColor> {
  const result = new Map<string, PaletteColor>();
  const taken = new Set<ColorId>();
  for (const id of projectIds) {
    const pick = picks[id];
    if (pick !== undefined && isColorId(pick)) {
      result.set(id, colorById(pick));
      taken.add(pick);
    }
  }
  // The slot space grows with the number of projects, so few projects only
  // ever get the clearest colours.
  const space = AUTO_ORDER.slice(0, Math.min(AUTO_ORDER.length, Math.max(MIN_AUTO_COLORS, projectIds.length)));
  for (const id of [...projectIds].sort()) {
    if (result.has(id)) continue;
    const start = hash(id) % space.length;
    let chosen = space[start] ?? "blue";
    for (let step = 0; step < space.length; step += 1) {
      const candidate = space[(start + step) % space.length] ?? "blue";
      if (!taken.has(candidate)) {
        chosen = candidate;
        break;
      }
    }
    taken.add(chosen);
    result.set(id, colorById(chosen));
  }
  return result;
}

/**
 * The avatar fill: the colour, deepening toward the corner. The deep end leans
 * a little warmer; leaning cooler turns yellows and limes muddy.
 */
export function avatarBackground({ hue, sat, light }: PaletteColor): string {
  return `linear-gradient(135deg, hsl(${hue} ${sat}% ${light + 4}%), hsl(${(hue + 348) % 360} ${sat}% ${light - 7}%))`;
}

/** A flat swatch for menus. */
export function swatch({ hue, sat, light }: PaletteColor): string {
  return `hsl(${hue} ${sat}% ${light}%)`;
}
