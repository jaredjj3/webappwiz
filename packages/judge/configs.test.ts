import { describe, expect, it } from "bun:test";
import { FakeConfigLoader } from "@webappwiz/rules";
import { defineJudge, SECTION } from "./config";
import { Configs } from "./configs";
import { testRule } from "./testing";

describe("Configs", () => {
	const configs = (config: ReturnType<typeof defineJudge>) =>
		new Configs(new FakeConfigLoader({ [SECTION]: config }));

	it("takes the rules the config names, and the defaults it does not", async () => {
		const { config, diagnostics } = await configs(
			defineJudge({ rules: [testRule("one")] }),
		).load("config.ts");

		expect(config.rules).toHaveLength(1);
		expect(config.agent).toBe("haiku");
		expect(config.concurrency).toBeGreaterThan(0);
		expect(diagnostics).toEqual([]);
	});

	it("reports what is wrong with a rule's document", async () => {
		const config = defineJudge({
			rules: [testRule("one", { document: "no title here" })],
		});

		const loaded = await configs(config).load("config.ts");

		// the rule still checks: only its report suffers
		expect(loaded.config.rules).toHaveLength(1);
		expect(
			loaded.diagnostics.map((diagnostic) => [
				diagnostic.rule,
				diagnostic.message,
			]),
		).toEqual([
			["one", "missing title (# heading)"],
			["one", "no ## Good section"],
			["one", "no ## Bad section"],
		]);
	});

	it("refuses two rules answering to the same id", async () => {
		const config = defineJudge({ rules: [testRule("one"), testRule("one")] });

		const { diagnostics } = await configs(config).load("config.ts");

		expect(diagnostics).toEqual([
			{
				rule: "one",
				severity: "error",
				message: 'duplicate rule id "one"',
			},
		]);
	});
});
