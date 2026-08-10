import type { Logger } from "@webappwiz/log";
import { MarkdownWriter } from "@webappwiz/md";
import type { Rule } from "@webappwiz/style";
import type { Fs } from "@webappwiz/sys";
import { walk } from "./walk";

export interface Task {
	rule: string;
	files: string[];
	prompt: string;
}

export const count = (n: number, word: string): string =>
	`${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Compiles a guide into agent tasks — one per rule × chunk of matching files —
 * and renders them as instructions to whatever agent asked. Nothing here runs
 * an agent; the caller does.
 */
export class Planner {
	// One rule per task is the point: an agent applying a single rule to a
	// bounded slice of files stays reliable where a whole guide over a whole repo
	// does not.
	constructor(
		private log: Logger,
		private fs: Fs,
	) {}

	async plan(rules: Rule[], dir: string, chunk: number): Promise<Task[]> {
		const all: string[] = [];
		for await (const path of walk(this.fs, dir)) {
			all.push(path.slice(dir.length + 1)); // dir-relative, like the globs
		}
		all.sort();
		const tasks: Task[] = [];
		for (const rule of rules) {
			const glob = new Bun.Glob(rule.files);
			const files = all.filter((f) => glob.match(f));
			if (files.length === 0) {
				// stderr, so a plan on stdout stays parseable
				this.log.error(`rule "${rule.name}" matches no files under ${dir}`);
			}
			// ponytail: chunks are counted in files, not tokens — switch to a byte
			// budget when repos with a few huge files start overflowing a task.
			for (let i = 0; i < files.length; i += chunk) {
				const slice = files.slice(i, i + chunk);
				tasks.push({
					rule: rule.name,
					files: slice,
					prompt: this.prompt(rule, dir, slice),
				});
			}
		}
		return tasks;
	}

	render(tasks: Task[], rules: number): string {
		const files = new Set(tasks.flatMap((t) => t.files)).size;
		const writer = new MarkdownWriter()
			.heading(
				1,
				`Style analysis plan: ${count(rules, "rule")}, ${count(files, "file")}, ${count(tasks.length, "task")}`,
			)
			.text(
				[
					"Execute every task below and merge their findings.",
					"",
					"- By default, spawn one subagent per task, all in parallel, giving each subagent its task's prompt verbatim.",
					"- If you cannot spawn subagents, perform each task yourself, one at a time, following its prompt exactly.",
					"- Merge the findings, dedupe by (rule, file, line), and report the result. An empty result means the code conforms.",
				].join("\n"),
			);
		tasks.forEach((task, i) => {
			writer
				.heading(2, `Task ${i + 1} of ${tasks.length}: ${task.rule}`)
				.code("", task.prompt);
		});
		return writer.toString();
	}

	private prompt(rule: Rule, dir: string, files: string[]): string {
		return new MarkdownWriter()
			.text(
				"You are checking code against exactly one style rule. " +
					"Apply only this rule; ignore every other style concern you notice.",
			)
			.text("The rule, verbatim:")
			.code("markdown", rule.text)
			.text(`Check each of these files (paths relative to ${dir}):`)
			.text(files.map((f) => `- ${f}`).join("\n"))
			.text(
				[
					"Read the files yourself. Report every violation of the rule as an element of one JSON array:",
					"",
					`[{"rule": ${JSON.stringify(rule.name)}, "file": "<path>", "line": <number>, "excerpt": "<the offending code>", "why": "<one sentence>"}]`,
					"",
					"Output only the JSON array. No violations means [].",
				].join("\n"),
			)
			.toString();
	}
}
