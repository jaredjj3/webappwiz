import { expect, test } from "bun:test";

import { Disposer, disposables } from "./index";

test("releases in reverse order of registration", () => {
	const released: string[] = [];
	const disposer = new Disposer();

	disposer.use(disposables.callback(() => released.push("first")));
	disposer.adopt("value", (v) => released.push(`adopted ${v}`));
	disposer.defer(() => released.push("last"));

	expect(disposer.disposed).toBe(false);
	disposer.dispose();

	expect(released).toEqual(["last", "adopted value", "first"]);
	expect(disposer.disposed).toBe(true);
});

test("disposing twice releases each resource once", () => {
	const released: string[] = [];
	const disposer = new Disposer();
	disposer.defer(() => released.push("once"));

	disposer.dispose();
	disposer.dispose();

	expect(released).toEqual(["once"]);
});

test("registering on a disposed disposer throws", () => {
	const disposer = new Disposer();
	disposer.dispose();

	expect(() => disposer.defer(() => {})).toThrow("disposed Disposer");
	expect(() => disposer.use(disposables.noop())).toThrow("disposed Disposer");
	expect(() => disposer.adopt(1, () => {})).toThrow("disposed Disposer");
});

test("nullable falls back to a no-op", () => {
	expect(() => disposables.nullable(null).dispose()).not.toThrow();

	const inner = disposables.callback(() => {
		throw new Error("released");
	});
	expect(() => disposables.nullable(inner).dispose()).toThrow("released");
});
