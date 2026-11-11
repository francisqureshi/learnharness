import type { QuestionDraft } from "@/src/core";

// Origin-scoped browser storage: never sent to another device. Storage can
// be unavailable (private mode/quota); the live form must keep working.
export function readLessonLocal<T>(chatId: string, field: string): T | undefined {
	try { return JSON.parse(localStorage.getItem(`lh:lesson:${chatId}:${field}`) ?? "null") ?? undefined; }
	catch { return undefined; }
}
export function writeLessonLocal(chatId: string, field: string, value: unknown): void {
	try { localStorage.setItem(`lh:lesson:${chatId}:${field}`, JSON.stringify(value)); } catch { /* live draft remains in memory */ }
}
export function readQuestionDraft(chatId: string, key: string): QuestionDraft | undefined {
	const saved = readLessonLocal<{ key: string; draft: QuestionDraft }>(chatId, "question");
	if (saved?.key !== key) return undefined;
	try {
		const draft = saved.draft;
		if (draft.form) {
			const form = draft.form;
			if (![form.thinking, form.other, form.text].every(v => typeof v === "string") || !Array.isArray(form.selection.selected)) return undefined;
			form.selection.selected = new Set(form.selection.selected);
		}
		return draft;
	} catch { return undefined; }
}
export function writeQuestionDraft(chatId: string, key: string, draft: QuestionDraft): void {
	writeLessonLocal(chatId, "question", { key, draft: { ...draft, ...(draft.form ? { form: { ...draft.form, selection: { ...draft.form.selection, selected: [...draft.form.selection.selected] } } } : {}) } });
}
