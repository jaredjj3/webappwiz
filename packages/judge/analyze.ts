import { join } from "node:path";
import { Dispatcher, type Events } from "@webappwiz/events";
import type { Logger } from "@webappwiz/log";
import {
	type Agent,
	DEFAULT_CONCURRENCY,
	type Finding,
	Harness,
	type Task as HarnessTask,
} from "@webappwiz/rules";
import { type Fs, type Glob, type Ps, walk } from "@webappwiz/sys";
import type { Clock, Duration } from "@webappwiz/time";
import type { Level } from "./diagnostic";
import { exemptions } from "./ignore";
import type { Rule } from "./rule/rule";

/** One agent call: the harness's task, plus the files judge chose for it. */
export interface Task extends HarnessTask {
	rules: Rule[];
	/** The files this task's prompt tells the agent to read, dir-relative. */
	files: string[];
	/** Always priced: judge knows the size of every file it names. */
	bytes: number;
}

/** One rule broken in one place, as the report prints it. */
export interface Violation {
	/** The rule's referenceable id, as `rules show` lists it. */
	id: string;
	level: Level;
	/** Path as the caller would type it: the judged dir plus the file. */
	file: string;
	line: number;
	/** How this code breaks the rule. Never what to do about it. */
	message: string;
	/** That line of the file, read from disk rather than from the agent. */
	code: string;
}

/** One task's worth of violations, handed over the moment its agent returns. */
export interface Finished {
	/** The glob the task's rules share, as the report heads it. */
	glob: string;
	/** The ids of the rules the task checked. */
	rules: string[];
	/** How many files this task's agent was told to read. */
	files: number;
	violations: Violation[];
	/** How long this task's agent took. */
	took: Duration;
	/** Dollars this task's call was billed, when the agent reported a figure. */
	cost?: number;
	done: number;
	total: number;
}

/** How much of the tree a run covers, and how finely it is cut up. */
export interface AnalyzeOptions {
	/** Files per task. Chunks are counted in files, not tokens. */
	chunk?: number;
	/**
	 * Narrows the run to these files, named the way the globs are, for a caller
	 * checking a subset of the tree rather than all of it. A rule matching
	 * nothing left in it is still worth saying so.
	 */
	only?: Set<string>;
}

/** Files per task when a caller does not say. */
export const DEFAULT_CHUNK = 25;

/** What a run reports as it goes, for a caller that prints as findings land. */
export type AnalyzerEvents = {
	/** One task, the moment its agent returns. */
	finished: Finished;
};

/**
 * Checks a directory against judge's rules, one task per glob the rules share
 * and chunk of matching files, and turns what the agent says into violations
 * the report can print.
 *
 * Everything file-shaped lives here: choosing the files, chunking them,
 * honoring `judge-ignore` markers and quoting the offending line off disk. The
 * harness underneath knows none of it.
 */
export class Analyzer {
	// Rules sharing a glob share a task: the files are what a task costs, and a
	// handful of one-page rules over a bounded slice of them keeps the agent
	// reliable at a fraction of what one task per rule paid to read the same
	// files once per rule.

	// A file matched by several rules is read once, not once per finding.
	private lines = new Map<string, Promise<string[]>>();
	private dispatcher = new Dispatcher<AnalyzerEvents>();
	private harness: Harness;

	/** Fires `finished` per task, so a caller can print findings as they land. */
	readonly events: Events<AnalyzerEvents> = this.dispatcher.events;

	constructor(
		private log: Logger,
		private fs: Fs,
		ps: Ps,
		clock: Clock,
		private glob: Glob,
	) {
		this.harness = new Harness(log, ps, clock);
	}

	/**
	 * Plans a run over `dir` and carries it out. A caller that wants to see the
	 * plan first, and decide whether to pay for it, calls `plan` and `run`
	 * itself instead.
	 */
	async analyze(
		rules: Rule[],
		dir: string,
		agent: Agent,
		options: AnalyzeOptions = {},
	): Promise<Violation[]> {
		return this.run(await this.plan(rules, dir, options), dir, agent);
	}

	/** The prompt a task would be spawned with, for a caller printing them
	 * instead of paying for them. */
	prompt(task: Task): string {
		return this.harness.prompt(task);
	}

	/**
	 * Hands each task to the harness, `concurrency` of them at a time, and turns
	 * the findings that come back into violations. Dispatches `finished` per
	 * task, and resolves with every violation in task order.
	 */
	async run(
		tasks: Task[],
		dir: string,
		agent: Agent,
		concurrency: number = DEFAULT_CONCURRENCY,
	): Promise<Violation[]> {
		const found: Violation[][] = [];
		// Reading the source a finding cites is async, so a task's violations are
		// not ready the instant its agent returns. These are what `run` waits for
		// after the harness is done, so nothing is dropped on the way out.
		const pending: Array<Promise<void>> = [];
		const off = this.harness.events.on("finished", (finished) => {
			const task = tasks[finished.at];
			if (!task) {
				return;
			}
			pending.push(
				this.violations(task, finished.findings, dir).then((violations) => {
					found[finished.at] = violations;
					this.dispatcher.dispatch("finished", {
						glob: task.label,
						rules: finished.rules,
						files: task.files.length,
						violations,
						took: finished.took,
						cost: finished.cost,
						done: finished.done,
						total: finished.total,
					});
				}),
			);
		});
		try {
			await this.harness.run(tasks, agent, { cwd: dir, concurrency });
			await Promise.all(pending);
		} finally {
			off();
		}
		return found.flat();
	}

	/** The tasks a run would spawn, without spawning any of them. */
	async plan(
		rules: Rule[],
		dir: string,
		{ chunk = DEFAULT_CHUNK, only }: AnalyzeOptions = {},
	): Promise<Task[]> {
		const all: string[] = [];
		const size = new Map<string, number>();
		for await (const path of walk(this.fs, dir)) {
			const file = path.slice(dir.length + 1); // dir-relative, like the globs
			if (only && !only.has(file)) {
				continue;
			}
			all.push(file);
			size.set(file, (await this.fs.stat(path)).size);
		}
		all.sort();
		// Grouped by the glob's exact text: rules over the same files ride in one
		// task and the files are read once, not once per rule.
		const groups = new Map<string, Rule[]>();
		for (const rule of rules) {
			groups.set(rule.files, [...(groups.get(rule.files) ?? []), rule]);
		}
		const tasks: Task[] = [];
		for (const [pattern, group] of groups) {
			const files = all.filter((file) => this.glob.matches(pattern, file));
			if (files.length === 0) {
				for (const rule of group) {
					// stderr, so the report on stdout stays parseable
					this.log.error(`rule "${rule.id}" matches no files under ${dir}`);
				}
			}
			// chunks are counted in files, not tokens: switch to a byte budget when
			// repos with a few huge files start overflowing a task.
			for (let i = 0; i < files.length; i += chunk) {
				const slice = files.slice(i, i + chunk);
				const draft: Omit<Task, "bytes"> = {
					rules: group,
					label: pattern,
					files: slice,
					context: [
						"Check each of these files, relative to your working directory:",
						slice.map((file) => `- ${file}`).join("\n"),
					].join("\n\n"),
					instructions: MARKERS,
				};
				tasks.push({
					...draft,
					bytes: slice.reduce(
						(bytes, file) => bytes + (size.get(file) ?? 0),
						Buffer.byteLength(this.harness.prompt(draft)),
					),
				});
			}
		}
		return tasks;
	}

	private async violations(
		task: Task,
		findings: Finding[],
		dir: string,
	): Promise<Violation[]> {
		const violations: Violation[] = [];
		for (const finding of findings) {
			const rule = task.rules.find(
				(candidate) => candidate.id === finding.rule,
			);
			if (!rule) {
				continue; // the harness already said so, and dropped it
			}
			if (finding.file === undefined || finding.line === undefined) {
				// Judge's rules are all about somewhere in particular, so a finding
				// with nowhere to point is one nobody can act on.
				this.log.error(
					`agent located no file for "${finding.rule}" on ${task.label}`,
				);
				continue;
			}
			const file = join(dir, finding.file);
			const source = await this.source(file);
			// The prompt asks the agent to honor markers; this is what enforces it.
			if (exemptions(source, rule.id)(finding.line)) {
				continue;
			}
			violations.push({
				id: rule.id,
				level: rule.level,
				file,
				line: finding.line,
				message: finding.message,
				// From disk, not from the agent: the quoted line is the reader's
				// evidence, and evidence a model wrote is no evidence at all.
				code: source[finding.line - 1]?.trim() ?? "",
			});
		}
		return violations.sort(cmp);
	}

	private source(file: string): Promise<string[]> {
		let lines = this.lines.get(file);
		if (!lines) {
			lines = this.fs
				.read(file)
				.then((text) => text.split("\n"))
				.catch(() => []);
			this.lines.set(file, lines);
		}
		return lines;
	}
}

/** What the prompt says about `judge-ignore`, which is judge's convention and
 * no business of the harness's. */
const MARKERS = [
	"Code excuses itself from a rule with a comment naming that rule's id:",
	"",
	"- `judge-ignore <id>: <reason>` excuses the line it sits above, " +
		"and everything indented under that line.",
	"- `judge-ignore-file <id>: <reason>` excuses the whole file.",
	"",
	"Report nothing an excused line does against the rule the marker names. " +
		"A marker excuses only that one rule, and a marker naming an id not " +
		"listed above excuses nothing here.",
].join("\n");

const cmp = (left: Violation, right: Violation): number =>
	left.file.localeCompare(right.file) || left.line - right.line;
