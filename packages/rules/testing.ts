import type { Complexity, Level } from "./rule";

/** Whatever a test wants to differ from a plain rule document. */
export interface RuleDocOptions {
	description?: string;
	files?: string;
	level?: Level;
	complexity?: Complexity;
	recommended?: boolean;
	version?: string;
}

/** A sound `RULE.md` for tests to install, parse, or break. */
export const ruleDoc = (name: string, opts: RuleDocOptions = {}): string =>
	[
		"---",
		`name: ${name}`,
		`description: ${opts.description ?? `Prose about ${name}.`}`,
		`files: "${opts.files ?? "**/*.ts"}"`,
		`level: ${opts.level ?? "error"}`,
		`complexity: ${opts.complexity ?? "medium"}`,
		...(opts.recommended === undefined
			? []
			: [`recommended: ${opts.recommended}`]),
		...(opts.version === undefined ? [] : [`version: ${opts.version}`]),
		"---",
		"",
		`# ${name}`,
		"",
		`Prose about ${name}.`,
		"",
		"## Good",
		"",
		"```ts",
		"class Foo {}",
		"```",
		"",
		"## Bad",
		"",
		"```ts",
		"class Foo {}",
		"class Bar {}",
		"```",
		"",
	].join("\n");
