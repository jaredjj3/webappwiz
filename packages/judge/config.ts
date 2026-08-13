import {
	DEFAULT_AGENT,
	DEFAULT_CONCURRENCY,
	type RunnerOptions,
} from "@webappwiz/rules";
import type { Rule } from "./rule/rule";

/** The section of `rules.config.ts` judge reads, as `defineJudge` resolves it. */
export interface Config extends RunnerOptions {
	// Each rule is a class that owns its glob, its level and its document, so
	// TypeScript's job here is only composition: the rules are a typed array,
	// and spreading shared rule sets stays statically checked.

	/** Every rule judge runs. There is no implicit set: a rule the config does
	 * not name does not run. */
	rules: Rule[];
}

/** A section as the config module writes it, before the defaults are filled in. */
export interface ConfigInput {
	rules: Rule[];
	agent?: string;
	concurrency?: number;
}

/** The key judge reads out of the config module. */
export const SECTION = "judge";

export const defineJudge = ({
	rules,
	agent = DEFAULT_AGENT,
	concurrency = DEFAULT_CONCURRENCY,
}: ConfigInput): Config => ({ rules, agent, concurrency });

/**
 * Guards a dynamically imported config section. Types cannot reach an untyped
 * or hand-written module, so the boundary re-checks.
 */
export function isConfig(value: unknown): value is Config {
	return (
		typeof value === "object" &&
		value !== null &&
		"agent" in value &&
		typeof value.agent === "string" &&
		"concurrency" in value &&
		typeof value.concurrency === "number" &&
		"rules" in value &&
		Array.isArray(value.rules) &&
		value.rules.every(
			(rule) =>
				typeof rule === "object" &&
				rule !== null &&
				typeof rule.id === "string" &&
				typeof rule.files === "string" &&
				typeof rule.document === "string",
		)
	);
}
