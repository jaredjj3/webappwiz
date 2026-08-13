import type { Rule } from "./rule/rule";

/** What a project analyzes its code with, as `defineConfig` resolves it. */
export interface Config {
	// Each rule is a class that owns its glob, its level and its document, so
	// TypeScript's job here is only composition: the rules are a typed array,
	// and spreading shared rule sets stays statically checked.

	/** Every rule this project runs. There is no implicit set: a rule a config
	 * does not name does not run. */
	rules: Rule[];
	/** The model an agent run uses when the caller does not name one. */
	agent: string;
	/** Agent calls in flight at once. */
	concurrency: number;
}

/** A config module's default export, before the defaults are filled in. */
export interface ConfigInput {
	rules: Rule[];
	agent?: string;
	concurrency?: number;
}

/** Where a project keeps its config unless it says otherwise. */
export const DEFAULT_CONFIG = "judge.config.ts";

/** The cheapest model that reads a rule and a file well enough to judge it.
 * Anything slower is a decision to make per project, in the config. */
export const DEFAULT_AGENT = "haiku";

/** Agent calls at once. A call is minutes of latency and no local work, so the
 * cap is about the provider's rate limits and your patience, not this machine:
 * raise it in the config when the limits allow. */
export const DEFAULT_CONCURRENCY = 4;

export const defineConfig = ({
	rules,
	agent = DEFAULT_AGENT,
	concurrency = DEFAULT_CONCURRENCY,
}: ConfigInput): Config => ({ rules, agent, concurrency });

/**
 * Guards a dynamically imported config module's default export. Types cannot
 * reach an untyped or hand-written module, so the boundary re-checks.
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
