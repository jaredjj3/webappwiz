import "../../setup";
import { describe, expect, it } from "bun:test";
import { renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { useResource } from "./use-resource";

class Resource {
	static built = 0;

	readonly id = Resource.built++;
	disposed = false;

	dispose(): void {
		this.disposed = true;
	}
}

describe("useResource", () => {
	it("returns the instance the factory built", () => {
		const resource = new Resource();
		const { result } = renderHook(() => useResource(() => resource, []));

		expect(result.current).toBe(resource);
	});

	it("keeps the same instance across renders of an inline factory", () => {
		const { result, rerender } = renderHook(() =>
			useResource(() => new Resource(), []),
		);
		const first = result.current;

		rerender();
		rerender();

		expect(result.current).toBe(first);
	});

	it("disposes the instance on unmount", () => {
		const resource = new Resource();
		const { unmount } = renderHook(() => useResource(() => resource, []));

		expect(resource.disposed).toBe(false);

		unmount();
		expect(resource.disposed).toBe(true);
	});

	it("rebuilds and disposes the old instance when a dep changes", () => {
		const { result, rerender } = renderHook(
			({ source }) => useResource(() => new Resource(), [source]),
			{
				initialProps: { source: "a" },
			},
		);
		const first = result.current;

		rerender({ source: "a" });
		expect(result.current).toBe(first);

		rerender({ source: "b" });

		expect(result.current).not.toBe(first);
		expect(first.disposed).toBe(true);
		expect(result.current.disposed).toBe(false);
	});

	it("hands back a live instance under StrictMode's effect replay", () => {
		// StrictMode runs setup, cleanup, then setup again. The first cleanup
		// disposes the instance, so re-adopting it would leave the component
		// holding a dead resource.
		const factory = () => new Resource();
		const { result } = renderHook(() => useResource(factory, []), {
			wrapper: StrictMode,
		});

		expect(result.current.disposed).toBe(false);
	});

	it("disposes the surviving instance when a StrictMode mount unmounts", () => {
		const factory = () => new Resource();
		const { result, unmount } = renderHook(() => useResource(factory, []), {
			wrapper: StrictMode,
		});
		const instance = result.current;

		unmount();

		expect(instance.disposed).toBe(true);
	});
});
