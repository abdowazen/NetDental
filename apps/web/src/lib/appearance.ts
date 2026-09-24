export const themeColors = [
  "default",
  "blue",
  "orange",
  "purple",
  "aqua-blue",
  "aqua-green",
] as const;
export type ThemeColor = (typeof themeColors)[number];
export type ThemeMode = "light" | "dark";
export type Appearance = { color: ThemeColor; mode: ThemeMode };
const storageKey = "clinic.appearance";

export function readAppearance(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    return {
      color: themeColors.includes(saved?.color) ? saved.color : "default",
      mode: saved?.mode === "dark" ? "dark" : "light",
    };
  } catch {
    return { color: "default", mode: "light" };
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
