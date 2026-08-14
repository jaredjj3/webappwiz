import { useEffect } from "react";

/**
 * Listens for a window event for as long as the component is mounted.
 *
 * The listener is re-attached whenever its identity changes, so pass a stable
 * function (or accept a re-attach per render, which is harmless for a plain
 * listener).
 */
export function useWindowEventListener<K extends keyof WindowEventMap>(
	type: K,
	listener: (this: Window, event: WindowEventMap[K]) => void,
	opts?: boolean | AddEventListenerOptions,
): void {
	useEffect(() => {
		window.addEventListener(type, listener, opts);
		return () => {
			window.removeEventListener(type, listener, opts);
		};
	}, [type, listener, opts]);
}
