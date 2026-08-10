import type { Logger } from "@webappwiz/log";
import { MarkdownWriter } from "@webappwiz/md";
import type { Rule } from "@webappwiz/style";
import type { Fs } from "@webappwiz/sys";
import { compileGuide, count, loadGuide, report } from "./style";
import { walk } from "./walk";

export interface Task {
	rule: string;
	files: string[];
	prompt: string;
}

/**
 * Compiles a guide into agent tasks: one per rule × chunk of matching files.
 * One rule per task is the point — an agent applying a single rule to a
 * bounded slice of files stays reliable where a whole guide over a whole repo
 * does not. Nothing here runs an agent; the caller does.
 */
export async function plan(
	rules: Rule[],
	dir: string,
	chunk: number,
	fs: Fs,
): Promise<Task[]> {
	const all: string[] = [];
	for await (const path of walk(fs, dir)) {
		all.push(path.slice(dir.length + 1)); // dir-relative, like the globs
	}
	all.sort();
	const tasks: Task[] = [];
	for (const rule of rules) {
		const glob = new Bun.Glob(rule.files);
		const files = all.filter((f) => glob.match(f));
		// ponytail: chunks are counted in files, not tokens — switch to a byte
		// budget when repos with a few huge files start overflowing a task.
		for (let i = 0; i < files.length; i += chunk) {
			const slice = files.slice(i, i + chunk);
			tasks.push({
				rule: rule.name,
				files: slice,
				prompt: prompt(rule, dir, slice),
			});
		}
	}
	return tasks;
}

/** What one task's agent is told. The rule text goes in verbatim — the whole
 * design exists to put the rule in front of a focused agent, undiluted. */
function prompt(rule: Rule, dir: string, files: string[]): string {
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

/** The plan as instructions to whatever agent ran the command. */
export function render(tasks: Task[], rules: number, _dir: string): string {
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

/** `analyze <rules> [dir]` — compile the guide and print the plan. */
export async function analyze(
	opts: { rules: string; dir: string; json: boolean; chunk: number },
	log: Logger,
	fs: Fs,
	load = loadGuide, // the import seam, so tests can hand a guide in
): Promise<void> {
	const { guide, dir: guideDir } = await load(opts.rules);
	const { rules, diagnostics } = await compileGuide(guide, guideDir, fs);
	if (diagnostics.some((d) => d.severity === "error")) {
		report(rules.length, diagnostics, false, log); // prints, then throws
	}
	const dir = opts.dir.replace(/\/+$/, "") || "/";
	const tasks = await plan(rules, dir, opts.chunk, fs);
	for (const rule of rules) {
		if (!tasks.some((t) => t.rule === rule.name)) {
			// stderr: advisory, and the plan on stdout stays parseable
			log.error(`rule "${rule.name}" matches no files under ${dir}`);
		}
	}
	log.info(
		opts.json
			? JSON.stringify({ dir, rules: rules.map((r) => r.name), tasks }, null, 2)
			: render(tasks, rules.length, dir),
	);
}
