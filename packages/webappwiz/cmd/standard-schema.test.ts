import { describe, expect, it } from "bun:test";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { MemoryLogger } from "webappwiz/log";
import { Command } from "./command";

describe("Command with Standard Schema", () => {
	const log = new MemoryLogger();

	function schema<T>(
		validate: StandardSchemaV1.Props<unknown, T>["validate"],
	): StandardSchemaV1<unknown, T> {
		return { "~standard": { version: 1, vendor: "elsewhere", validate } };
	}

	it("accepts another vendor and infers its transformed output", () => {
		const number = schema((value) => ({ value: Number(value) }));
		const command = new Command("serve").arg("port", number).action((opts) => {
			const port: number = opts.port;
			return port;
		});

		expect(command.exec(["8080"], { log })).toBe(8080);
	});

	it("reports the first issue with string, numeric, and object path segments", () => {
		const invalid = schema(() => ({
			issues: [
				{ message: "bad port", path: ["servers", 0, { key: "port" }] },
				{ message: "another issue", path: ["host"] },
			],
		}));

		expect(() =>
			new Command("serve").arg("input", invalid).exec(["bad"], { log }),
		).toThrow(new Error("servers.0.port: bad port"));
	});

	it("does not accept a failure with no issues as a parsed value", () => {
		const invalid = schema(() => ({ issues: [] }));

		expect(() =>
			new Command("serve").arg("input", invalid).exec(["bad"], { log }),
		).toThrow(new Error("invalid"));
	});

	it("refuses asynchronous validation before running the action", () => {
		let ran = false;
		const asynchronous = schema(async (value) => ({ value }));
		const command = new Command("serve")
			.arg("input", asynchronous)
			.action(() => {
				ran = true;
			});

		expect(() => command.exec(["value"], { log })).toThrow(
			"elsewhere validated asynchronously, which is not supported here",
		);
		expect(ran).toBe(false);
	});
});
