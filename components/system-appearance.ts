"use client";
import { useSyncExternalStore } from "react";

const QUERY = "(prefers-color-scheme: dark)";
function subscribe(listener: () => void) {
	const media = window.matchMedia(QUERY);
	media.addEventListener("change", listener);
	return () => media.removeEventListener("change", listener);
}
function snapshot() { return window.matchMedia?.(QUERY).matches ?? true; }
export function useSystemAppearance(): "dark" | "light" {
	return useSyncExternalStore(subscribe, snapshot, () => true) ? "dark" : "light";
}
