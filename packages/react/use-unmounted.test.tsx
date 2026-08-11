import { describe, expect, it, mock } from "bun:test";
import { renderHook } from "@testing-library/react";
import "./dom";
import { useUnmounted } from "./use-unmounted";

describe("useUnmounted", () => {
	it("stays quiet while mounted", () => {
		const callback = mock(() => {});
		const { rerender } = renderHook(() => useUnmounted(callback));

		rerender();
		rerender();

		expect(callback).not.toHaveBeenCalled();
	});

	it("runs the callback once on unmount", () => {
		const callback = mock(() => {});
		const { unmount } = renderHook(() => useUnmounted(callback));

		unmount();

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it("runs the latest closure rather than the one from the first render", () => {
		const seen: string[] = [];
		const { rerender, unmount } = renderHook(
			({ value }) =>
				useUnmounted(() => {
					seen.push(value);
				}),
			{ initialProps: { value: "a" } },
		);

		rerender({ value: "b" });
		unmount();

		expect(seen).toEqual(["b"]);
	});
});
