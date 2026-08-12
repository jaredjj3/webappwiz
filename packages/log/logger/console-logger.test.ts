import { beforeEach, describe, expect, it } from "bun:test";

import { ConsoleLogger, FakeConsole } from "../index";

describe("ConsoleLogger", () => {
	let out: FakeConsole;
	let logger: ConsoleLogger;

	beforeEach(() => {
		out = new FakeConsole();
		logger = new ConsoleLogger(out);
	});

	it("forwards info to the console's log", () => {
		logger.info("ready", 1, true);

		expect(out.logged).toEqual([["ready", 1, true]]);
	});

	it("forwards error to the console's error", () => {
		const error = new Error("boom");

		logger.error("failed", error);

		expect(out.errored).toEqual([["failed", error]]);
	});
});
