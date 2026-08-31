import { describe, expect, it } from "bun:test";
import { t } from "webappwiz/t";

import { Config } from "./config";

const settings = Config.factory({
	host: t.string(),
	port: t.number(),
});

describe("Config", () => {
	it("validates on create and reads keys back typed", () => {
		const config = settings.create({ host: "localhost", port: 8080 });
		expect(config.get("host")).toBe("localhost");
		expect(config.get("port")).toBe(8080);
	});

	it("rejects a value the schema does not, naming the path", () => {
		expect(() => settings.create({ host: "localhost", port: "8080" })).toThrow(
			"port",
		);
	});

	it("returns a frozen record", () => {
		const record = settings
			.create({ host: "localhost", port: 8080 })
			.toRecord();
		expect(Object.isFrozen(record)).toBe(true);
	});

	it("updates into a new Config, leaving the original alone", () => {
		const before = settings.create({ host: "localhost", port: 8080 });
		const after = before.update({ port: 9090 });
		expect(after.get("port")).toBe(9090);
		expect(after.get("host")).toBe("localhost");
		expect(before.get("port")).toBe(8080);
	});

	it("revalidates on update", () => {
		const config = settings.create({ host: "localhost", port: 8080 });
		expect(() => config.update({ port: "nine thousand" })).toThrow("port");
	});
});
