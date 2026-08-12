// lint-ignore-file objects-over-callbacks: a component reacts to a transition with a closure over its own props, and handing it a Dispatcher instead would need another hook to subscribe and unsubscribe
import { useCallback, useRef, useState } from "react";
import { useWindowEventListener } from "./use-window-event-listener";

export interface WindowFocusOptions {
	/** Run once each time the window takes focus. */
	onFocus?: () => void;
	/** Run once each time the window loses it. */
	onBlur?: () => void;
}

/**
 * Tracks whether the window has focus, optionally calling back on each
 * transition. On the server it reports focused, since there is nothing to ask.
 */
export function useWindowFocus({
	onFocus,
	onBlur,
}: WindowFocusOptions = {}): boolean {
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
