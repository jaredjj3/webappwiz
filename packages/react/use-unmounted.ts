import { useEffect, useRef } from "react";

/**
 * Runs a callback on unmount, whatever its identity does between renders. The
 * callback that runs is the latest one committed before the unmount.
 */
export function useUnmounted(callback: () => void): void {
	const callbackRef = useRef(callback);
	callbackRef.current = callback;
	useEffect(() => () => callbackRef.current(), []);
}
