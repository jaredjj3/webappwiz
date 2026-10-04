import type { Judge, Judgment, Verdict } from "./judge";
import type { Effort, Level } from "./rule";

/** Whatever a test wants to differ from a plain rule document. */
export interface RuleDocOptions {
	description?: string;
	files?: string;
	level?: Level;
	effort?: Effort;
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
		...(opts.effort === undefined ? [] : [`effort: ${opts.effort}`]),
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

/** What a `FakeJudge` says beside its answers. */
export interface FakeJudgeOptions {
	/** The input tokens it says each judgment spent; none when not given. */
	input?: number;
}

/**
 * A judge that answers every question with the same probability of yes, or
 * fails with the error it was given, and keeps the judgments it was asked.
 */
export class FakeJudge implements Judge {
	readonly judgments: Judgment[] = [];

	constructor(
		private answer: number | Error,
		private opts: FakeJudgeOptions = {},
	) {}

	async judge(judgment: Judgment): Promise<Verdict> {
		this.judgments.push(judgment);
		if (this.answer instanceof Error) {
			throw this.answer;
		}
		const answer = this.answer;
		return {
			answers: new Map(
				Object.keys(judgment.questions).map((id) => [id, answer]),
			),
			...(this.opts.input === undefined ? {} : { input: this.opts.input }),
		};
	}
}
