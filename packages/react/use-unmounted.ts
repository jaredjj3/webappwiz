import { useEffect, useRef } from "react";

/**
 * Runs a callback on unmount, whatever its identity does between renders. The
 * callback that runs is the latest one committed before the unmount.
 */
// lint-ignore objects-over-callbacks: the destructor `useEffect` returns, held
// through a ref so a fresh arrow each render does not re-attach it.
export function useUnmounted(callback: () => void): void {
	const callbackRef = useRef(callback);
	callbackRef.current = callback;
	useEffect(() => () => callbackRef.current(), []);
}
