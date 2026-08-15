import { describe, expect, it } from "bun:test";

import { CompositeLogger, type LogEntry, MemoryLogger } from "./index";

describe("CompositeLogger", () => {
	it("logs to all loggers", () => {
		const firstLogger = new MemoryLogger();
		const secondLogger = new MemoryLogger();
		const logger = new CompositeLogger([firstLogger, secondLogger]);
		const error = new Error("boom");

		logger.info("ready", 1, true);
		logger.error("failed", error);

		const expected: LogEntry[] = [
			{
				level: "info",
				message: "ready",
				optionalParams: [1, true],
				timestamp: expect.any(Date),
			},
			{
				level: "error",
				message: "failed",
				optionalParams: [error],
				timestamp: expect.any(Date),
			},
		];
		expect(firstLogger.entries).toEqual(expected);
		expect(secondLogger.entries).toEqual(expected);
	});
});
