export const themeColors = [
  "clinical-teal",
  "dental-blue",
  "warm-amber",
  "soft-violet",
  "ocean-cyan",
  "fresh-emerald",
] as const;
export type ThemeColor = (typeof themeColors)[number];
export type ThemeMode = "light" | "dark";
export type Appearance = { color: ThemeColor; mode: ThemeMode };
const storageKey = "clinic.appearance";
const defaultAppearance: Appearance = { color: "clinical-teal", mode: "light" };
const legacyThemeColors: Record<string, ThemeColor> = {
  default: "clinical-teal",
  blue: "dental-blue",
  orange: "warm-amber",
  purple: "soft-violet",
  "aqua-blue": "ocean-cyan",
  "aqua-green": "fresh-emerald",
};

function normalizeAppearance(value: unknown): Appearance {
  if (!value || typeof value !== "object") return defaultAppearance;
  const saved = value as { color?: unknown; mode?: unknown };
  const color =
    typeof saved.color === "string"
      ? legacyThemeColors[saved.color] ??
        (themeColors.includes(saved.color as ThemeColor)
          ? (saved.color as ThemeColor)
          : null)
      : null;
  if (!color || (saved.mode !== "light" && saved.mode !== "dark"))
    return defaultAppearance;
  return { color, mode: saved.mode };
}

export function readAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(storageKey);
    const appearance = normalizeAppearance(JSON.parse(raw ?? "null"));
    if (raw && raw !== JSON.stringify(appearance))
      localStorage.setItem(storageKey, JSON.stringify(appearance));
    return appearance;
  } catch {
    return defaultAppearance;
  }
}

export function applyAppearance(appearance: Appearance) {
  document.documentElement.dataset.color = appearance.color;
  document.documentElement.dataset.mode = appearance.mode;
}

export function saveAppearance(appearance: Appearance): boolean {
  applyAppearance(appearance);
  try {
    localStorage.setItem(storageKey, JSON.stringify(appearance));
    return true;
  } catch {
    return false;
  }
}
