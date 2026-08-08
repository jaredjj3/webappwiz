import { expect, test } from "bun:test";

import { AsyncDisposer } from "./index";

// Inlined rather than taking @webappwiz/time, which depends on this package.
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("awaits each release, in reverse order of registration", async () => {
	const released: string[] = [];
	const disposer = new AsyncDisposer();
	const slow = (name: string) => async () => {
		await sleep(1);
		released.push(name);
	};

	disposer.use({ disposeAsync: slow("first") });
	disposer.adopt("value", async (v) => {
		released.push(`adopted ${v}`);
	});
	disposer.defer(slow("last"));

	await disposer.disposeAsync();

	expect(released).toEqual(["last", "adopted value", "first"]);
	expect(disposer.disposed).toBe(true);
});

test("disposing twice releases each resource once", async () => {
	const released: string[] = [];
	const disposer = new AsyncDisposer();
	disposer.defer(async () => {
		released.push("once");
	});

	await disposer.disposeAsync();
	await disposer.disposeAsync();

	expect(released).toEqual(["once"]);
});

test("registering on a disposed disposer throws", async () => {
	const disposer = new AsyncDisposer();
	await disposer.disposeAsync();

	expect(() => disposer.defer(async () => {})).toThrow(
		"disposed AsyncDisposer",
	);
});

test("disposeAsync survives being passed as a bare callback", async () => {
	const released: string[] = [];
	const disposer = new AsyncDisposer();
	disposer.defer(async () => {
		released.push("released");
	});

	const shutdown = disposer.disposeAsync;
	await shutdown();

	expect(released).toEqual(["released"]);
});
