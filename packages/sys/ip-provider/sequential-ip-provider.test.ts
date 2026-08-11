import { describe, expect, it } from "bun:test";

import { SequentialIpProvider } from "./sequential-ip-provider";
import { StaticIpProvider } from "./static-ip-provider";

describe("SequentialIpProvider", () => {
	const throwing = { get: () => Promise.reject(new Error("boom")) };

	it("skips throwing and empty providers", async () => {
		expect(
			await new SequentialIpProvider([
				throwing,
				StaticIpProvider.empty(),
				new StaticIpProvider("1.2.3.4"),
				StaticIpProvider.localhost(),
			]).get(),
		).toBe("1.2.3.4");
	});

	it("returns empty when no provider answers", async () => {
		expect(await new SequentialIpProvider([throwing]).get()).toBe("");
		expect(await new SequentialIpProvider([]).get()).toBe("");
	});
});
