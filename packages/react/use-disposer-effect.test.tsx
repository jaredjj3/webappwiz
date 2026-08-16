import "../../setup";
import { describe, expect, it } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useDisposerEffect } from "./use-disposer-effect";

describe("useDisposerEffect", () => {
	it("disposes what the callback registered when the effect is torn down", () => {
		let disposed = false;
		const { unmount } = renderHook(() =>
			useDisposerEffect((disposer) => {
				disposer.defer(() => {
					disposed = true;
				});
			}, []),
		);

		expect(disposed).toBe(false);

		unmount();
		expect(disposed).toBe(true);
	});

	it("disposes what the callback registered before it threw", () => {
		let disposed = false;
		const acquire = () =>
			renderHook(() =>
				useDisposerEffect((disposer) => {
					disposer.defer(() => {
						disposed = true;
					});
					throw new Error("second resource failed");
				}, []),
			);

		expect(acquire).toThrow("second resource failed");
		expect(disposed).toBe(true);
	});
});
