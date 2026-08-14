import { beforeEach, describe, expect, it } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { Dispatcher } from "@webappwiz/events";
import { StrictMode } from "react";
import "@webappwiz/browser/dom";
import { useReactive } from "./use-reactive";

type CounterEvents = { change: undefined };

class Counter {
	private dispatcher = new Dispatcher<CounterEvents>();
	readonly events = this.dispatcher.events;

	count = 0;
	subscriptions = 0;

	constructor() {
		const on = this.dispatcher.events.on.bind(this.dispatcher.events);
		this.dispatcher.events.on = (type, listener, opts) => {
			this.subscriptions++;
			return on(type, listener, opts);
		};
	}

	bump(): void {
		this.count++;
		this.dispatcher.dispatch("change");
	}
}

describe("useReactive", () => {
	let counter: Counter;

	beforeEach(() => {
		counter = new Counter();
	});

	it("returns the current selection", () => {
		counter.count = 3;
		const { result } = renderHook(() =>
			useReactive(counter, (state) => state.count, ["change"]),
		);

		expect(result.current).toBe(3);
	});

	it("re-renders when a listened event changes the selection", () => {
		const { result } = renderHook(() =>
			useReactive(counter, (state) => state.count, ["change"]),
		);

		act(() => {
			counter.bump();
		});

		expect(result.current).toBe(1);
	});

	it("subscribes once across many renders", () => {
		// The hook used to build a fresh store every render, which gave
		// useSyncExternalStore a new `subscribe` identity each time and made it
		// tear down and rebuild every listener.
		const { rerender } = renderHook(() =>
			useReactive(counter, (state) => state.count, ["change"]),
		);

		rerender();
		rerender();
		rerender();

		expect(counter.subscriptions).toBe(1);
	});

	it("hands back the same object across renders when a selector rebuilds it", () => {
		// A fresh store per render meant a fresh snapshot object per render, so
		// a selector returning an object literal gave every consumer a new
		// identity on every render and defeated downstream memoization.
		const { result, rerender } = renderHook(() =>
			useReactive(counter, (state) => ({ count: state.count }), ["change"]),
		);
		const first = result.current;

		rerender();
		rerender();

		expect(result.current).toBe(first);
		expect(first).toEqual({ count: 0 });
	});

	it("reads the latest selector closure rather than the one from the first render", () => {
		const { result, rerender } = renderHook(
			({ offset }) =>
				useReactive(counter, (state) => state.count + offset, ["change"]),
			{ initialProps: { offset: 10 } },
		);

		rerender({ offset: 100 });
		act(() => {
			counter.bump();
		});

		expect(result.current).toBe(101);
	});

	it("unsubscribes on unmount", () => {
		const { unmount } = renderHook(() =>
			useReactive(counter, (state) => state.count, ["change"]),
		);

		unmount();
		act(() => {
			counter.bump();
		});

		expect(counter.count).toBe(1);
	});

	it("survives StrictMode's double render and mount", () => {
		const { result } = renderHook(
			() => useReactive(counter, (state) => state.count, ["change"]),
			{
				wrapper: StrictMode,
			},
		);

		act(() => {
			counter.bump();
		});

		expect(result.current).toBe(1);
	});
});
