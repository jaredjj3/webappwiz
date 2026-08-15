import { describe, expect, it } from "bun:test";

import { LevelPrefixLogger, MemoryLogger } from "./index";

describe("LevelPrefixLogger", () => {
	it("prefixes info and error messages by level", () => {
		const memoryLogger = new MemoryLogger();
		const logger = new LevelPrefixLogger({ log: memoryLogger });
		const error = new Error("boom");

		logger.info("ready", 1);
		logger.error("failed", error);

		expect(memoryLogger.entries).toEqual([
			{
				level: "info",
				message: "[INFO] ready",
				optionalParams: [1],
				timestamp: expect.any(Date),
			},
			{
				level: "error",
				message: "[ERROR] failed",
				optionalParams: [error],
				timestamp: expect.any(Date),
			},
		]);
	});
});
