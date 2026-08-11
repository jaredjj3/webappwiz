import type { Check } from "./rule";

/**
 * The rules a project checks its code against. A guide module default-exports
 * `defineGuide([...])`.
 */
export interface Guide {
	// The data lives in one markdown file per rule, readable by humans
	// rendered and by agents verbatim, so TypeScript's job here is only
	// composition: the guide is a typed array, and spreading shared rule sets
	// stays statically checked.
	rules: RuleRef[];
}

/** A pointer to a rule's markdown file, relative to the guide module, and the
 * check enforcing it deterministically when it has one. */
export interface RuleRef {
	path: string;
	check?: Check;
	partial?: boolean;
}

export const rule = (
	path: string,
	opts: { check?: Check; partial?: boolean } = {},
): RuleRef => ({ path, ...opts });

/** Where a project keeps its guide unless it says otherwise. */
export const DEFAULT_GUIDE = "lint.config.ts";

export const defineGuide = (rules: RuleRef[]): Guide => ({ rules });

/**
 * Guards a dynamically imported guide module's default export. Types cannot
 * reach an untyped or hand-written module, so the boundary re-checks.
 */
export function isGuide(value: unknown): value is Guide {
	return (
		typeof value === "object" &&
		value !== null &&
		"rules" in value &&
		Array.isArray(value.rules) &&
		value.rules.every(
			(r) => typeof r === "object" && r !== null && typeof r.path === "string",
		)
	);
}
