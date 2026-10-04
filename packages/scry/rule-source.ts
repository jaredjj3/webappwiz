import type { Level } from "./rule";

/** The settings a test wants its rule's class to declare. */
export interface RuleSourceOptions {
	description?: string;
	files?: string;
	level?: Level;
	threshold?: number;
	recommended?: boolean;
}

/**
 * A `rule.ts` for tests to install: a class with `members` beside the static
 * settings, which describe it and read every `.ts` file unless told
 * otherwise.
 */
export const ruleSource = (
	members = "async check() { return []; }",
	opts: RuleSourceOptions = {},
): string =>
	[
		"export default class {",
		`\tstatic description = ${JSON.stringify(opts.description ?? "Prose about the rule.")};`,
		`\tstatic files = ${JSON.stringify(opts.files ?? "**/*.ts")};`,
		...(opts.level === undefined
			? []
			: [`\tstatic level = ${JSON.stringify(opts.level)};`]),
		...(opts.threshold === undefined
			? []
			: [`\tstatic threshold = ${opts.threshold};`]),
		...(opts.recommended === undefined
			? []
			: [`\tstatic recommended = ${opts.recommended};`]),
		`\t${members}`,
		"}",
		"",
	].join("\n");
