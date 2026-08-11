import { type EffectCallback, useEffect, useRef } from "react";

/**
 * Runs an effect once on mount, whatever the callback's identity does between
 * renders, and runs its destructor on unmount. The callback that runs is the
 * latest one committed before the mount.
 */
export function useMounted(effect: EffectCallback): void {
	const effectRef = useRef(effect);
	effectRef.current = effect;
	useEffect(() => effectRef.current(), []);
}
