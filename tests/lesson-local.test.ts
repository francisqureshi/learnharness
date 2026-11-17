import { test } from "node:test";
import assert from "node:assert/strict";
import { readLessonLocal, writeLessonLocal, readQuestionDraft, writeQuestionDraft } from "../components/lesson-local.ts";

test("draft persistence round-trips selections, isolates sessions/questions, tolerates unavailable storage", () => {
	const values = new Map<string, string>();
	const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
	Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
	try {
		const draft = { form: { selection: { selected: new Set([0, 2]), otherSelected: true, dontKnow: false }, thinking: "reasoning", other: "other", text: "answer", confidenceIndex: 3 }, readingThinking: "reading" };
		writeQuestionDraft("a", "q1", draft);
		assert.deepEqual(readQuestionDraft("a", "q1"), draft);
		assert.equal(readQuestionDraft("a", "q2"), undefined);
		assert.equal(readQuestionDraft("b", "q1"), undefined);
		writeLessonLocal("a", "composer", "unsent");
		assert.equal(readLessonLocal("a", "composer"), "unsent");
		values.set("lh:lesson:a:question", "{broken");
		assert.equal(readQuestionDraft("a", "q1"), undefined);
		Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("blocked"); } });
		assert.doesNotThrow(() => writeLessonLocal("a", "composer", "keep live"));
		assert.equal(readLessonLocal("a", "composer"), undefined);
	} finally {
		if (original) Object.defineProperty(globalThis, "localStorage", original);
		else Reflect.deleteProperty(globalThis, "localStorage");
	}
});
