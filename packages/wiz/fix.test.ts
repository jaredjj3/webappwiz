import { expect, test } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakePs } from "@webappwiz/sys/testing";

import { fix } from "./fix";

test("writes fixes by default, then typechecks", async () => {
	const ps = new FakePs();

	await fix({ check: false }, new MemoryLogger(), ps);

	expect(ps.getCalls()).toEqual([
		"bunx biome check --write --unsafe .",
		"bunx tsc --noEmit",
	]);
});

test("--check leaves the tree alone", async () => {
	const ps = new FakePs();

	await fix({ check: true }, new MemoryLogger(), ps);

	expect(ps.getCalls()).toEqual(["bunx biome check .", "bunx tsc --noEmit"]);
});

test("throws when biome fails, without typechecking", async () => {
	const ps = new FakePs();
	ps.exit(1); // FakePs returns this exit code from every spawn

	await expect(fix({ check: false }, new MemoryLogger(), ps)).rejects.toThrow(
		"Biome check failed",
	);
});
