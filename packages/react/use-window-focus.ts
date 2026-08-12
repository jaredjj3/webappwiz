import { useCallback, useRef, useState } from "react";
import { useWindowEventListener } from "./use-window-event-listener";

/**
 * Tracks whether the window has focus, optionally calling back on each
 * transition. On the server it reports focused, since there is nothing to ask.
 */
// lint-ignore objects-over-callbacks: a component's way of reacting to a
// transition is a closure over its own props, which is what a hook takes.
// Handing it a Dispatcher would mean a hook to subscribe and unsubscribe from.
export function useWindowFocus(
	onFocus?: () => void,
	onBlur?: () => void,
): boolean {
	const [focused, setFocused] = useState(() =>
		typeof document === "undefined" ? true : document.hasFocus(),
	);

	// Read through refs so the listeners attach once, rather than re-attaching
	// whenever the caller passes fresh arrow functions.
	const onFocusRef = useRef(onFocus);
	onFocusRef.current = onFocus;
	const onBlurRef = useRef(onBlur);
	onBlurRef.current = onBlur;

	const handleFocus = useCallback(() => {
		setFocused(true);
		onFocusRef.current?.();
	}, []);

	const handleBlur = useCallback(() => {
		setFocused(false);
		onBlurRef.current?.();
	}, []);

	useWindowEventListener("focus", handleFocus);
	useWindowEventListener("blur", handleBlur);

	return focused;
}
