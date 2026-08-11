import { useSyncExternalStore } from "react";

const MEDIA_QUERY = "(pointer: coarse)";

/** Whether the primary pointer is coarse, tracking changes to the media query. */
export function useIsTouchDevice(): boolean {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function subscribe(onChange: () => void): () => void {
	const query = window.matchMedia(MEDIA_QUERY);
	query.addEventListener("change", onChange);
	return () => {
		query.removeEventListener("change", onChange);
	};
}

function getSnapshot(): boolean {
	return window.matchMedia(MEDIA_QUERY).matches;
}

function getServerSnapshot(): boolean {
	return false;
}
