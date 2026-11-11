"use client";

import { useSyncExternalStore } from "react";

// Electron's own narrow-window policy remains unchanged. Include landscape
// phones without treating a normal desktop window as a touch device.
const PHONE_QUERY = "(max-width: 639px), (max-width: 1023px) and (pointer: coarse)";
export function isPhoneLayout(): boolean {
	return typeof window !== "undefined" && !navigator.userAgent.includes("Electron") && (window.matchMedia?.(PHONE_QUERY).matches ?? false);
}
function subscribe(listener: () => void) {
	const query = window.matchMedia?.(PHONE_QUERY);
	query?.addEventListener("change", listener);
	return () => query?.removeEventListener("change", listener);
}
export function usePhoneLayout() { return useSyncExternalStore(subscribe, isPhoneLayout, () => false); }
