import type { Level } from "./rule-document";

/** Whatever a test wants to differ from a plain rule document. */
export interface RuleDocOptions {
	description?: string;
	files?: string;
	level?: Level;
	recommended?: boolean;
	threshold?: number;
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
		...(opts.recommended === undefined
			? []
			: [`recommended: ${opts.recommended}`]),
		...(opts.threshold === undefined ? [] : [`threshold: ${opts.threshold}`]),
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
