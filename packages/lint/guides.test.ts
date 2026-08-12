import { beforeEach, describe, expect, it } from "bun:test";
import { FakeFs } from "@webappwiz/sys/testing";
import { defineGuide } from "./guide";
import { FakeGuideLoader } from "./guide-loader/fake-guide-loader";
import { Guides } from "./guides";
import { recommended } from "./recommended";
import { testRule } from "./testing";

describe("Guides", () => {
	let fs: FakeFs;

	beforeEach(() => {
		fs = new FakeFs();
	});

	it("falls back to the recommended rules with no guide to read", async () => {
		const { rules, diagnostics } = await new Guides(fs).project();

		expect(rules).toEqual(recommended);
		expect(diagnostics).toEqual([]);
	});

	it("reports what is wrong with a rule's document", async () => {
		const guide = defineGuide([testRule("one", { document: "no title here" })]);

		const { rules, diagnostics } = await new Guides(
			fs,
			new FakeGuideLoader(guide),
		).load("guide.ts");

		// the rule still checks: only its report suffers
		expect(rules).toHaveLength(1);
		expect(
			diagnostics.map((diagnostic) => [diagnostic.rule, diagnostic.message]),
		).toEqual([
			["one", "missing title (# heading)"],
			["one", "no ## Good section"],
			["one", "no ## Bad section"],
		]);
	});

	it("refuses two rules answering to the same id", async () => {
		const guide = defineGuide([testRule("one"), testRule("one")]);

		const { diagnostics } = await new Guides(
			fs,
			new FakeGuideLoader(guide),
		).load("guide.ts");

		expect(diagnostics).toEqual([
			{
				rule: "one",
				severity: "error",
				message: 'duplicate rule id "one"',
			},
		]);
	});
});
