import { describe, expect, it } from "bun:test";
import { t } from "webappwiz/t";

import { Config } from "./config";

const settings = Config.factory({
	host: t.string(),
	port: t.number(),
});

describe("Config", () => {
	it("validates on parse and reads keys back typed", () => {
		const config = settings.parse({ host: "localhost", port: 8080 });
		expect(config.get("host")).toBe("localhost");
		expect(config.get("port")).toBe(8080);
	});

	it("rejects a value the schema does not, naming the path", () => {
		expect(() => settings.parse({ host: "localhost", port: "8080" })).toThrow(
			"port",
		);
	});

	it("returns a frozen record", () => {
		const record = settings.parse({ host: "localhost", port: 8080 }).toRecord();
		expect(Object.isFrozen(record)).toBe(true);
	});

	it("updates into a new Config, leaving the original alone", () => {
		const before = settings.parse({ host: "localhost", port: 8080 });
		const after = before.update({ port: 9090 });
		expect(after.get("port")).toBe(9090);
		expect(after.get("host")).toBe("localhost");
		expect(before.get("port")).toBe(8080);
	});

	it("coerces a record of raw strings, env-style", () => {
		const flags = Config.factory({
			host: t.string(),
			port: t.number(),
			debug: t.optional(t.boolean()),
		});
		const config = flags.coerce({ host: "localhost", port: "8080" });
		expect(config.get("port")).toBe(8080);
		expect(config.get("debug")).toBeUndefined();
		expect(
			flags.coerce({ ...process.env, host: "h", port: "1" }).get("port"),
		).toBe(1);
	});

	it("rejects a missing required key on coerce", () => {
		expect(() => settings.coerce({ host: "localhost" })).toThrow("port");
	});

	it("revalidates on update", () => {
		const config = settings.parse({ host: "localhost", port: 8080 });
		expect(() => config.update({ port: "nine thousand" })).toThrow("port");
	});
});
