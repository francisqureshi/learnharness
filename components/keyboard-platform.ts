"use client";
import { useSyncExternalStore } from "react";

/** iPadOS can advertise a desktop Mac user agent; real Macs are not touch devices. */
export function isIOSKeyboard(device: Pick<Navigator, "userAgent" | "maxTouchPoints"> | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
	return !!device && !device.userAgent.includes("Electron") &&
		(/iPhone|iPad|iPod/.test(device.userAgent) || (/Macintosh/.test(device.userAgent) && device.maxTouchPoints > 1));
}
const subscribe = () => () => {};
export function useIOSKeyboard(): boolean {
	return useSyncExternalStore(subscribe, isIOSKeyboard, () => false);
}
