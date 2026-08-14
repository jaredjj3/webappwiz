import { describe, expect, it, mock } from "bun:test";
import { renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import "@webappwiz/browser/dom";
import { useMounted } from "./use-mounted";

describe("useMounted", () => {
	it("runs the effect once on mount", () => {
		const effect = mock(() => {});
		renderHook(() => useMounted(effect));

		expect(effect).toHaveBeenCalledTimes(1);
	});

	it("leaves the effect alone when a fresh closure arrives every render", () => {
		const runs = mock(() => {});
		const { rerender } = renderHook(() => useMounted(() => runs()));

		rerender();
		rerender();

		expect(runs).toHaveBeenCalledTimes(1);
	});

	it("runs the latest closure committed before the mount", () => {
		const seen: string[] = [];
		renderHook(
			({ value }) =>
				useMounted(() => {
					seen.push(value);
				}),
			{ initialProps: { value: "a" } },
		);

		expect(seen).toEqual(["a"]);
	});

	it("runs the destructor on unmount", () => {
		const destructor = mock(() => {});
		const { unmount } = renderHook(() => useMounted(() => destructor));

		expect(destructor).not.toHaveBeenCalled();

		unmount();
		expect(destructor).toHaveBeenCalledTimes(1);
	});

	it("ends mounted after StrictMode replays setup and cleanup", () => {
		let setups = 0;
		let cleanups = 0;
		const effect = () => {
			setups++;
			return () => {
				cleanups++;
			};
		};

		const { unmount } = renderHook(() => useMounted(effect), {
			wrapper: StrictMode,
		});

		expect(setups - cleanups).toBe(1);

		unmount();
		expect(setups).toBe(cleanups);
	});
});
