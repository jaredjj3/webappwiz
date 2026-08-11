import { describe, expect, it } from "bun:test";
import { checkGuide, compile, type Rule } from "../rule";
import { recommended } from "./index";

const compiled = async (): Promise<Rule[]> => {
	const rules: Rule[] = [];
	for (const ref of recommended) {
		const out = compile(await Bun.file(ref.path).text(), ref.path, ref);
		expect(out.diagnostics).toEqual([]);
		if (out.rule) {
			rules.push(out.rule);
		}
	}
	return rules;
};

describe("recommended rules", () => {
	it("compiles every rule without diagnostics, under distinct names", async () => {
		const rules = await compiled();

		expect(rules).toHaveLength(recommended.length);
		expect(checkGuide(rules)).toEqual([]);
	});

	// The examples are the check's conformance suite: what keeps the document
	// and the implementation from drifting apart is that one tests the other.
	it("passes every checked rule's Good examples", async () => {
		for (const rule of await compiled()) {
			for (const good of rule.check ? rule.good : []) {
				expect(rule.check?.(good), `${rule.id} flags a Good example`).toEqual(
					[],
				);
			}
		}
	});

	it("catches every Bad example of a full check", async () => {
		// Not of a partial one: partial says the agent decides the cases the
		// check cannot see, and the Bad section is allowed to show those.
		for (const rule of await compiled()) {
			for (const bad of rule.check && !rule.partial ? rule.bad : []) {
				expect(
					rule.check?.(bad).length,
					`${rule.id} misses a Bad example`,
				).toBeGreaterThan(0);
			}
		}
	});
});
