import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Dispatcher } from "@webappwiz/events";
import { ReactiveExternalStore } from "./reactive-external-store";

type CounterEvents = { change: undefined; other: undefined };

class Counter {
	private dispatcher = new Dispatcher<CounterEvents>();
	readonly events = this.dispatcher.events;

	count = 0;
	label = "a";

	bump(): void {
		this.count++;
		this.dispatcher.dispatch("change");
	}

	touch(): void {
		this.dispatcher.dispatch("other");
	}
}

describe("ReactiveExternalStore", () => {
	let counter: Counter;

	beforeEach(() => {
		counter = new Counter();
	});

	it("reports the selected value before anyone subscribes", () => {
		counter.count = 7;
		const store = new ReactiveExternalStore(counter, (c) => c.count, [
			"change",
		]);

		expect(store.getSnapshot()).toBe(7);
	});

	it("notifies when a listened event changes the selection", () => {
		const store = new ReactiveExternalStore(counter, (c) => c.count, [
			"change",
		]);
		const onStoreChange = mock(() => {});
		store.subscribe(onStoreChange);

		counter.bump();

		expect(onStoreChange).toHaveBeenCalledTimes(1);
		expect(store.getSnapshot()).toBe(1);
	});

	it("stays quiet when a listened event leaves the selection alone", () => {
		const store = new ReactiveExternalStore(counter, (c) => c.label, [
			"change",
		]);
		const onStoreChange = mock(() => {});
		store.subscribe(onStoreChange);

		counter.bump();

		expect(onStoreChange).not.toHaveBeenCalled();
	});

	it("stays quiet for events it was not given", () => {
		const store = new ReactiveExternalStore(counter, (c) => c.count, [
			"change",
		]);
		const onStoreChange = mock(() => {});
		store.subscribe(onStoreChange);

		counter.count = 99;
		counter.touch();

		expect(onStoreChange).not.toHaveBeenCalled();
	});

	it("stays quiet when an object selection is only shallowly unchanged", () => {
		const store = new ReactiveExternalStore(
			counter,
			(c) => ({ label: c.label }),
			["change"],
		);
		const onStoreChange = mock(() => {});
		store.subscribe(onStoreChange);

		counter.bump();

		expect(onStoreChange).not.toHaveBeenCalled();
	});

	it("catches up on a change that landed before subscribing", () => {
		const store = new ReactiveExternalStore(counter, (c) => c.count, [
			"change",
		]);
		counter.count = 5;

		store.subscribe(() => {});

		expect(store.getSnapshot()).toBe(5);
	});

	it("stops notifying once unsubscribed", () => {
		const store = new ReactiveExternalStore(counter, (c) => c.count, [
			"change",
		]);
		const onStoreChange = mock(() => {});
		const unsubscribe = store.subscribe(onStoreChange);

		unsubscribe();
		counter.bump();

		expect(onStoreChange).not.toHaveBeenCalled();
	});

	it("keeps its method identities stable, so React does not resubscribe", () => {
		const store = new ReactiveExternalStore(counter, (c) => c.count, [
			"change",
		]);

		expect(store.subscribe).toBe(store.subscribe);
		expect(store.getSnapshot).toBe(store.getSnapshot);
		expect(store.getServerSnapshot).toBe(store.getServerSnapshot);
	});
});
