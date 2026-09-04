import type { ChangedFile } from "./changed";
import { RULE_FILE, RULES_ROOT } from "./layout";
import type { Rule } from "./rule";

/** Which piece of a rule's files a block is, when the rule needed several. */
export interface BlockOptions {
	part?: number;
	parts?: number;
}

/**
 * One unit of review: one rule over some of the changed files. Its `prompt`
 * is the whole of what a subagent is told, and it names the rule's file
 * rather than quoting it, so the parent that prints the prompt never reads
 * the rule.
 */
export class Block {
	readonly part: number;
	readonly parts: number;

	constructor(
		readonly rule: Rule,
		readonly files: readonly ChangedFile[],
		opts: BlockOptions = {},
	) {
		this.part = opts.part ?? 1;
		this.parts = opts.parts ?? 1;
	}

	/** The line a parent reads: the rule, how big the block is, and how hard. */
	heading(): string {
		const part = this.parts > 1 ? ` ${this.part}/${this.parts}` : "";
		const count = `${this.files.length} file${this.files.length === 1 ? "" : "s"}`;
		return `## ${this.rule.id}${part} (${count}, complexity ${this.rule.complexity})`;
	}

	/** The subagent's whole instruction, headed by `heading()`. */
	prompt(since: string): string {
		const path = `${RULES_ROOT}/${this.rule.id}/${RULE_FILE}`;
		const id = this.rule.id;
		const lines = [this.heading()];
		if (this.rule.hints !== undefined) {
			lines.push(`hints: ${this.rule.hints}`);
		}
		lines.push(
			"",
			`Read \`${path}\` and apply that rule, and only that rule, to the files ` +
				`listed below. Judge only what changed since \`${since}\`: run ` +
				`\`git diff ${since} -- <file>\` to see the change, and read the file ` +
				"whole for context. A file marked (new) has no diff; read all of it. " +
				"If the rule concerns a construct, grep for it or write a one-off " +
				"script first and skip the files that lack it. A comment holding " +
				`\`rule-ignore ${id}: <reason>\` excuses the statement under it, and ` +
				`\`rule-ignore-file ${id}: <reason>\` excuses its whole file.`,
			"",
			...this.files.map(
				(file) => `- ${file.path}${file.added ? " (new)" : ""}`,
			),
			"",
			"Reply with only a JSON array, one element per violation, or [] when " +
				'there is none: [{"file": "<path>", "line": <1-based line>, ' +
				'"message": "<what the code does that the rule forbids: one ' +
				'lowercase clause, naming the construct, never the fix>"}]',
		);
		return lines.join("\n");
	}
}
