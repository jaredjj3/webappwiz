import { describe, expect, it } from "bun:test";
import { RuleDocument } from "@webappwiz/judge";
import config from "./judge.config";

describe("judge.config", () => {
	it("carries a sound document under a distinct id for every rule", () => {
		const diagnostics = config.rules.flatMap((rule) =>
			new RuleDocument(rule).diagnostics(),
		);

		expect(diagnostics).toEqual([]);
		expect(new Set(config.rules.map((rule) => rule.id)).size).toBe(
			config.rules.length,
		);
	});

	// The examples are the check's conformance suite: what keeps the document
	// and the implementation from drifting apart is that one tests the other.
	it("passes every checked rule's Good examples", () => {
		for (const rule of config.rules) {
			for (const good of rule.check ? new RuleDocument(rule).good : []) {
				expect(rule.check?.(good), `${rule.id} flags a Good example`).toEqual(
					[],
				);
			}
		}
	});

	it("catches every Bad example of a full check", () => {
		// Not of a partial one: partial says the agent decides the cases the
		// check cannot see, and the Bad section is allowed to show those.
		for (const rule of config.rules) {
			const bad = rule.check && !rule.partial ? new RuleDocument(rule).bad : [];
			for (const example of bad) {
				expect(
					rule.check?.(example).length,
					`${rule.id} misses a Bad example`,
				).toBeGreaterThan(0);
			}
		}
	});
});
