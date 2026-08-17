import { describe, expect, it } from "bun:test";

import { MemoryLogger, PrefixLogger } from "./index";

describe("PrefixLogger", () => {
	it("prefixes info and error messages", () => {
		const memoryLogger = new MemoryLogger();
		const logger = new PrefixLogger("[worker]", { log: memoryLogger });
		const error = new Error("boom");

		logger.info("ready", 1, true);
		logger.error("failed", error);

		expect(memoryLogger.entries).toEqual([
			{
				level: "info",
				message: "[worker] ready",
				optionalParams: [1, true],
				timestamp: expect.any(Date),
			},
			{
				level: "error",
				message: "[worker] failed",
				optionalParams: [error],
				timestamp: expect.any(Date),
			},
		]);
	});
});
