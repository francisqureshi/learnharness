/**
 * The app's ONE mermaid renderer (the chrome-melt wave, 2026-09-19): both the
 * in-chat block (components/md-blocks.tsx) and the session-scoped focus
 * overlay (components/session-overlay.tsx) render charts through this module
 * — system-aware themes, one plugin instance, unique render ids. This
 * REPLACES streamdown's internal mermaid path entirely: its fullscreen portal
 * was hard-wired `fixed inset-0` (covering the window-drag bar, X landing in
 * drag territory) with no styling hook, which is what drove the custom
 * component in the first place.
 */

import { createMermaidPlugin } from "@streamdown/mermaid";
import type { MermaidConfig } from "mermaid";

/** The chart's base font size (px) — mermaid sizes ALL text relative to
 *  this, so it's the number the display-width cap (md-blocks) divides by:
 *  a chart shown at its natural width renders text at exactly this size.
 *  Pinned explicitly so a mermaid default change can't silently shift the
 *  cap (owner rule, chrome-melt tweaks wave, 2026-09-19: chart text must
 *  never render larger than the session's own text). */
export const MERMAID_FONT_SIZE = 16;

export const mermaidTheme: MermaidConfig = {
	fontFamily: "ui-sans-serif, system-ui, sans-serif",
	fontSize: MERMAID_FONT_SIZE,
	securityLevel: "strict",
	theme: "dark",
};

const plugin = createMermaidPlugin();

/** Render one chart source to an svg string. The id is unique per call —
 *  mermaid caches rendered ids, and a repeated id across charts/renders
 *  returns the stale svg (the bug streamdown's own id minting avoids). */
// Mermaid initialization is global: serialize configuration and render together.
let pending: Promise<unknown> = Promise.resolve();
export function renderMermaid(chart: string, mode: "dark" | "light" = "dark"): Promise<string> {
	const render = pending.then(async () => {
		const id = `lh-mermaid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
		const config: MermaidConfig = mode === "dark" ? mermaidTheme : {
			...mermaidTheme,
			theme: "base",
			themeVariables: {
				background: "#f2f1ef", primaryColor: "#e2e1df",
				primaryTextColor: "#24262d", primaryBorderColor: "#766b90",
				lineColor: "#6d6d69", secondaryColor: "#dddddb",
				tertiaryColor: "#c7d7e0", textColor: "#24262d",
			},
		};
		const { svg } = await plugin.getMermaid(config).render(id, chart);
		return svg;
	});
	pending = render.catch(() => {});
	return render;
}
