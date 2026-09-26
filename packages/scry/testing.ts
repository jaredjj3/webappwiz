import type { Effort, Level } from "./rule";

/** Whatever a test wants to differ from a plain rule document. */
export interface RuleDocOptions {
	description?: string;
	files?: string;
	level?: Level;
	effort?: Effort;
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
		...(opts.effort === undefined ? [] : [`effort: ${opts.effort}`]),
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

/**
 * An agent that answers every prompt the same way, or fails with the error
 * it was given, and keeps the prompts it was asked.
 */
export class FakeAgent {
	readonly prompts: string[] = [];

	constructor(private answer: string | Error) {}

	async ask(prompt: string): Promise<string> {
		this.prompts.push(prompt);
		if (this.answer instanceof Error) {
			throw this.answer;
		}
		return this.answer;
	}
}
