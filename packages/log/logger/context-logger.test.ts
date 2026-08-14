import { beforeEach, describe, expect, it } from "bun:test";

import { MdcLogger, MemoryLogger } from "../index";

describe("MdcLogger", () => {
	let memoryLogger: MemoryLogger;

	beforeEach(() => {
		memoryLogger = new MemoryLogger();
	});

	it("prefixes messages with context and merges context with withContext", () => {
		const logger = new MdcLogger({ foo: "bar" }, { log: memoryLogger });
		const withMoreContext = logger.withContext({ baz: "bam" });
		const error = new Error("boom");

		logger.info("ready", 1);
		withMoreContext.error("failed", error);

		expect(memoryLogger.entries).toEqual([
			{
				level: "info",
				message: "[foo=bar] ready",
				optionalParams: [1],
				timestamp: expect.any(Date),
				callsite: expect.any(String),
			},
			{
				level: "error",
				message: "[foo=bar] [baz=bam] failed",
				optionalParams: [error],
				timestamp: expect.any(Date),
				callsite: expect.any(String),
			},
		]);
	});

	it("overrides existing keys when calling withContext", () => {
		const logger = new MdcLogger(
			{ foo: "bar", baz: "bam" },
			{ log: memoryLogger },
		).withContext({
			foo: "updated",
		});

		logger.info("ready");

		expect(memoryLogger.entries).toEqual([
			{
				level: "info",
				message: "[foo=updated] [baz=bam] ready",
				optionalParams: [],
				timestamp: expect.any(Date),
				callsite: expect.any(String),
			},
		]);
	});
});
