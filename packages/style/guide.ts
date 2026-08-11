/**
 * The rules a project checks its code against. A style guide module
 * default-exports `defineStyleGuide([...])`.
 */
export interface StyleGuide {
	// The data lives in one markdown file per rule, readable by humans
	// rendered and by agents verbatim, so TypeScript's job here is only
	// composition: the guide is a typed array, and spreading shared rule sets
	// stays statically checked.
	rules: RuleRef[];
}

/** A pointer to a rule's markdown file, relative to the guide module. */
export interface RuleRef {
	path: string;
}

export const rule = (path: string): RuleRef => ({ path });

/** Where a project keeps its guide unless it says otherwise. */
export const DEFAULT_GUIDE = "style.config.ts";

export const defineStyleGuide = (rules: RuleRef[]): StyleGuide => ({ rules });

/**
 * Guards a dynamically imported guide module's default export. Types cannot
 * reach an untyped or hand-written module, so the boundary re-checks.
 */
export function isStyleGuide(value: unknown): value is StyleGuide {
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
