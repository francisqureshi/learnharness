"use client";
import { useEffect, useRef } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { readLessonLocal, writeLessonLocal } from "./lesson-local";

type Position = { anchor?: string; offset: number; top: number; bottom: boolean };

/** Message anchors survive width changes; explicit graph/hash navigation wins. */
export function LessonReadingPosition({ chatId }: { chatId: string }) {
	const context = useStickToBottomContext();
	const current = useRef(context);
	current.current = context;
	useEffect(() => {
		const saved = readLessonLocal<Position>(chatId, "position");
		let main: HTMLElement | null = null;
		let restoring = !!saved && !window.location.hash;
		let frames = 0;
		let frame = 0;
		const save = () => {
			if (!main || restoring) return;
			const rect = main.getBoundingClientRect();
			const anchor = [...main.querySelectorAll<HTMLElement>('[id^="message-"]')].find(el => el.getBoundingClientRect().bottom > rect.top);
			writeLessonLocal(chatId, "position", { anchor: anchor?.id, offset: anchor ? anchor.getBoundingClientRect().top - rect.top : 0, top: main.scrollTop, bottom: main.scrollHeight - main.clientHeight - main.scrollTop < 24 });
		};
		const interact = () => { restoring = false; };
		const tick = () => {
			if (!main) {
				main = current.current.scrollRef.current;
				if (main) {
					main.addEventListener("scroll", save, { passive: true });
					main.addEventListener("touchstart", interact, { passive: true });
					main.addEventListener("wheel", interact, { passive: true });
					main.addEventListener("pointerdown", interact);
				}
			}
			if (main && restoring && saved && !saved.bottom) {
				current.current.stopScroll();
				const anchor = saved.anchor ? document.getElementById(saved.anchor) : null;
				const top = anchor && main.contains(anchor) ? main.scrollTop + anchor.getBoundingClientRect().top - main.getBoundingClientRect().top - saved.offset : saved.top;
				if (Number.isFinite(top)) main.scrollTop = top;
			}
			if (++frames < 30) frame = requestAnimationFrame(tick);
			else restoring = false;
		};
		frame = requestAnimationFrame(tick);
		window.addEventListener("pagehide", save);
		return () => {
			cancelAnimationFrame(frame);
			save();
			window.removeEventListener("pagehide", save);
			main?.removeEventListener("scroll", save);
			main?.removeEventListener("touchstart", interact);
			main?.removeEventListener("wheel", interact);
			main?.removeEventListener("pointerdown", interact);
		};
	}, [chatId]);
	return null;
}
