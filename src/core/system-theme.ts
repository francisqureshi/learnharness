import { DEFAULT_THEME, effectiveColors, themeVars, type Theme } from "./themes.ts";
import type { AppearanceSettings } from "./settings.ts";

/** Device-local appearance; shared settings never override the device mode. */
export const PEARL_THEME: Theme = {
 id: "kanso-pearl", name: "Kanso Pearl", mode: "light", builtin: true,
 colors: { background: "#f2f1ef", surface: "#e2e1df", border: "#c9cbd1", text: "#24262d", textMuted: "#6d6d69", accent: "#766b90", bold: "#24262d", italic: "#24262d", code: "#766b90", error: "#c84053", success: "#6f894e", warning: "#77713f" },
};
export function systemTheme(mode: "dark" | "light"): Theme { return mode === "light" ? PEARL_THEME : DEFAULT_THEME; }
export function systemThemeVars(mode: "dark" | "light", appearance?: Pick<AppearanceSettings, "background" | "colors" | "mdRendering">): Record<string, string> {
 const theme = systemTheme(mode);
 const vars = themeVars(effectiveColors(theme, mode === "dark" ? appearance : undefined), mode);
 return mode === "dark" ? vars : { ...vars, "--popover": "#f2f1ef", "--accent": "#dddddb", "--input": "#9f9f99" };
}
