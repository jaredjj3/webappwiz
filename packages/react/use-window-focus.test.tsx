import { describe, expect, it, mock } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import "@webappwiz/browser/dom";
import { useWindowFocus } from "./use-window-focus";

function fire(type: "focus" | "blur"): void {
	act(() => {
		window.dispatchEvent(new Event(type));
	});
}

describe("useWindowFocus", () => {
	it("reports blurred after a blur event", () => {
		const { result } = renderHook(() => useWindowFocus());

		fire("blur");

		expect(result.current).toBe(false);
	});

	it("reports focused again after a focus event", () => {
		const { result } = renderHook(() => useWindowFocus());

		fire("blur");
		fire("focus");

		expect(result.current).toBe(true);
	});

	it("calls back on each transition", () => {
		const onFocus = mock(() => {});
		const onBlur = mock(() => {});
		renderHook(() => useWindowFocus({ onFocus, onBlur }));

		fire("blur");
		fire("focus");

		expect(onBlur).toHaveBeenCalledTimes(1);
		expect(onFocus).toHaveBeenCalledTimes(1);
	});

	it("calls the latest callbacks when fresh ones arrive every render", () => {
		// The listeners attach once, so they must read the callbacks through a
		// ref rather than capturing the pair from the first render.
		const later = mock(() => {});
		const { rerender } = renderHook(
			({ onBlur }) => useWindowFocus({ onBlur }),
			{
				initialProps: { onBlur: () => {} },
			},
		);

		rerender({ onBlur: later });
		fire("blur");

		expect(later).toHaveBeenCalledTimes(1);
	});

	it("stops listening after unmount", () => {
		const onBlur = mock(() => {});
		const { unmount } = renderHook(() => useWindowFocus({ onBlur }));

		unmount();
		fire("blur");

		expect(onBlur).not.toHaveBeenCalled();
	});
});
