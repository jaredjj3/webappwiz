import type { ChangedFile } from "./changed";
import { RULE_FILE, RULES_ROOT } from "./layout";
import type { Complexity, Rule } from "./rule";

/**
 * One unit of review: some rules of one complexity over the files every one
 * of them matches. Its `prompt` is the whole of what a subagent is told, and
 * it names each rule's file rather than quoting it, so the parent that prints
 * the prompt never reads a rule.
 *
 * Every rule here applies to every file here, which is what lets the subagent
 * read a file and its diff once and judge it against the lot rather than once
 * per rule.
 */
export class Block {
	/** The complexity its rules share, for whoever chooses the model. */
	readonly complexity: Complexity;

	constructor(
		/** Which block this is, 1-based, so a heading can name it. */
		readonly number: number,
		readonly rules: readonly Rule[],
		readonly files: readonly ChangedFile[],
	) {
		const first = rules[0];
		if (first === undefined) {
			throw new Error(`block ${number} has no rules`);
		}
		this.complexity = first.complexity;
	}

	/** The line a parent reads: how big the block is, and how hard. */
	heading(): string {
		const size = `${count(this.rules.length, "rule")}, ${count(this.files.length, "file")}`;
		return `## block ${this.number} (${size}, complexity ${this.complexity})`;
	}

	/** The subagent's whole instruction, headed by `heading()`. */
	prompt(since: string): string {
		const lines = [
			this.heading(),
			"",
			"Read each rule listed below and apply those rules, and only those, " +
				`to the files listed after them. Judge only what changed since ` +
				`\`${since}\`: run \`git diff ${since} -- <file>\` to see the change, ` +
				"and read the file whole for context. A file marked (new) has no " +
				"diff; read all of it. If a rule concerns a construct, grep for it " +
				"or write a one-off script first and skip the files that lack it. A " +
				"comment holding `rule-ignore <rule>: <reason>` excuses the " +
				"statement under it, and `rule-ignore-file <rule>: <reason>` excuses " +
				"its whole file, for the rule it names and no other.",
			"",
			"Rules:",
			"",
			...this.rules.map(
				(rule) =>
					`- \`${RULES_ROOT}/${rule.id}/${RULE_FILE}\` (${rule.id}, ${rule.level})`,
			),
			"",
			"Files:",
			"",
			...this.files.map(
				(file) => `- ${file.path}${file.added ? " (new)" : ""}`,
			),
			"",
			"Reply with only a JSON array, one element per violation, or [] when " +
				'there is none: [{"rule": "<the rule it breaks>", "file": "<path>", ' +
				'"line": <1-based line>, "message": "<what the code does that the ' +
				"rule forbids: one lowercase clause, naming the construct, never the " +
				'fix>"}]',
		];
		return lines.join("\n");
	}
}

/** `1 rule`, `2 rules`: the plural a heading needs. */
function count(total: number, noun: string): string {
	return `${total} ${noun}${total === 1 ? "" : "s"}`;
}
