import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../config.ts";
import { writeFileAtomicSync } from "./atomic-write.ts";

// Separate from settings and chat updatedAt: viewing is not learning activity.
export function readLastLesson(): string | null {
	try {
		const value = JSON.parse(fs.readFileSync(path.join(PATHS.data, "last-lesson.json"), "utf8"));
		return typeof value.chatId === "string" && /^[A-Za-z0-9_-]+$/.test(value.chatId) ? value.chatId : null;
	} catch { return null; }
}
export function writeLastLesson(chatId: string): void {
	if (!/^[A-Za-z0-9_-]+$/.test(chatId)) throw new Error("Invalid lesson id");
	fs.mkdirSync(PATHS.data, { recursive: true });
	writeFileAtomicSync(path.join(PATHS.data, "last-lesson.json"), JSON.stringify({ chatId }));
}
