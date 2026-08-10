import { describe, expect, it } from "bun:test";

import { MemoryLogger } from "./index";

describe("MemoryLogger", () => {
	it("stores info and error entries and can clear them", () => {
		const logger = new MemoryLogger();
		const error = new Error("boom");

		logger.info("ready", 1, true);
		logger.error("failed", error);

		expect(logger.entries).toEqual([
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

		logger.clear();

		expect(logger.entries).toEqual([]);
	});
});
