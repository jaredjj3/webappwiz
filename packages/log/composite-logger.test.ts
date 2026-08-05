import { expect, test } from "bun:test";

import { CompositeLogger, MemoryLogger } from "./index";

test("logs to all loggers", () => {
	const firstLogger = new MemoryLogger();
	const secondLogger = new MemoryLogger();
	const logger = new CompositeLogger([firstLogger, secondLogger]);
	const error = new Error("boom");

	logger.info("ready", 1, true);
	logger.error("failed", error);

	expect(firstLogger.entries).toEqual([
		{
			level: "info",
			message: "ready",
			optionalParams: [1, true],
			timestamp: expect.any(Date),
			callsite: expect.any(String),
		},
		{
			level: "error",
			message: "failed",
			optionalParams: [error],
			timestamp: expect.any(Date),
			callsite: expect.any(String),
		},
	]);

	expect(secondLogger.entries).toEqual([
		{
			level: "info",
			message: "ready",
			optionalParams: [1, true],
			timestamp: expect.any(Date),
			callsite: expect.any(String),
		},
		{
			level: "error",
			message: "failed",
			optionalParams: [error],
			timestamp: expect.any(Date),
			callsite: expect.any(String),
		},
	]);
});
