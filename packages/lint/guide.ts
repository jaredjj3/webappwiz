import type { Rule } from "./rule/rule";

/**
 * The rules a project checks its code against. A guide module default-exports
 * `defineGuide([...])`.
 */
export interface Guide {
	// Each rule is a class that owns its glob, its level and its document, so
	// TypeScript's job here is only composition: the guide is a typed array,
	// and spreading shared rule sets stays statically checked.
	rules: Rule[];
}

/** Where a project keeps its guide unless it says otherwise. */
export const DEFAULT_GUIDE = "lint.config.ts";

export const defineGuide = (rules: Rule[]): Guide => ({ rules });

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
			(r) =>
				typeof r === "object" &&
				r !== null &&
				typeof r.id === "string" &&
				typeof r.files === "string" &&
				typeof r.document === "string",
		)
	);
}
