import { describe, expect, it } from "bun:test";

import { ConsoleLogger } from "./index";

describe("ConsoleLogger", () => {
	it("forwards info to console.log and error to console.error", () => {
		const logger = new ConsoleLogger();
		const originalLog = console.log;
		const originalError = console.error;
		const logCalls: unknown[][] = [];
		const errorCalls: unknown[][] = [];
		const error = new Error("boom");

		console.log = ((...args: unknown[]) => {
			logCalls.push(args);
		}) as typeof console.log;

		console.error = ((...args: unknown[]) => {
			errorCalls.push(args);
		}) as typeof console.error;

		try {
			logger.info("ready", 1, true);
			logger.error("failed", error);
		} finally {
			console.log = originalLog;
			console.error = originalError;
		}

		expect(logCalls).toEqual([["ready", 1, true]]);
		expect(errorCalls).toEqual([["failed", error]]);
	});
});
