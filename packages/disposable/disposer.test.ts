import { beforeEach, describe, expect, it } from "bun:test";

import { Disposer, disposables } from "./index";

describe("Disposer", () => {
	let disposer: Disposer;
	let released: string[];

	beforeEach(() => {
		disposer = new Disposer();
		released = [];
	});

	it("releases in reverse order of registration", () => {
		disposer.use(disposables.callback(() => released.push("first")));
		disposer.adopt("value", (v) => released.push(`adopted ${v}`));
		disposer.defer(() => released.push("last"));

		expect(disposer.disposed).toBe(false);
		disposer.dispose();

		expect(released).toEqual(["last", "adopted value", "first"]);
		expect(disposer.disposed).toBe(true);
	});

	it("releases each resource once when disposed twice", () => {
		disposer.defer(() => released.push("once"));

		disposer.dispose();
		disposer.dispose();

		expect(released).toEqual(["once"]);
	});

	it("throws when registering on a disposed disposer", () => {
		disposer.dispose();

		expect(() => disposer.defer(() => {})).toThrow("disposed Disposer");
		expect(() => disposer.use(disposables.noop())).toThrow("disposed Disposer");
		expect(() => disposer.adopt(1, () => {})).toThrow("disposed Disposer");
	});

	it("falls back to a no-op for a nullable disposable", () => {
		expect(() => disposables.nullable(null).dispose()).not.toThrow();

		const inner = disposables.callback(() => {
			throw new Error("released");
		});
		expect(() => disposables.nullable(inner).dispose()).toThrow("released");
	});
});
