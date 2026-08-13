import { join } from "node:path";
import { Dispatcher, type Events } from "@webappwiz/events";
import type { Logger } from "@webappwiz/log";
import { MarkdownWriter } from "@webappwiz/md";
import { type Fs, type Ps, walk } from "@webappwiz/sys";
import type { Clock, Duration } from "@webappwiz/time";
import { DEFAULT_CONCURRENCY } from "./config";
import type { Level } from "./diagnostic";
import { exemptions } from "./ignore";
import type { Rule } from "./rule/rule";

export interface Task {
	/** Every rule in the config whose glob is exactly this task's `glob`. */
	rules: Rule[];
	/** The glob the task's rules share, which is how reports name the task. */
	glob: string;
	files: string[];
	prompt: string;
	/**
	 * The prompt plus every file it tells the agent to read. A floor on what the
	 * call costs, and the only part of the cost that can be known before paying
	 * it: the agent's own system prompt and whatever it re-reads are not in here.
	 */
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

/** One task's worth of findings, handed over the moment its agent returns. */
export interface Finished {
	/** The glob the task's rules share, as the report heads it. */
	glob: string;
	/** The ids of the rules the task checked. */
	rules: string[];
	violations: Violation[];
	/** How long this task's agent took. */
	took: Duration;
	/**
	 * Dollars this task's call was billed, straight from the agent rather than
	 * priced here. Undefined for an agent that does not report one, which is any
	 * `--exec` command: reports leave the money off rather than guess it.
	 */
	cost?: number;
	done: number;
	total: number;
}

/** What one task is handed to: the argv to spawn, and how reports name it. */
export interface Agent {
	argv: string[];
	label: string;
}

/**
 * The models `--agent` names, so a run can pick one without a command.
 *
 * `--output-format json` wraps the answer in an envelope that also carries what
 * the call was billed, which is the only place a real dollar figure comes from:
 * there is no price list to fetch, and pricing tokens ourselves would miss the
 * agent's own system prompt, which is most of what a small call costs.
 */
export const AGENTS: Record<string, string[]> = {
	haiku: ["claude", "-p", "--output-format", "json", "--model", "haiku"],
	sonnet: ["claude", "-p", "--output-format", "json", "--model", "sonnet"],
	opus: ["claude", "-p", "--output-format", "json", "--model", "opus"],
};

/** The two ways to say what runs a task, of which a caller passes one. */
export interface AgentOptions {
	/** A model to ask, keyed into `AGENTS`. */
	agent?: string;
	/** A command to hand the prompt to instead. */
	exec?: string;
}

/**
 * Resolves `--agent` and `--exec`, which are alternatives: name a model, or
 * give a command to run it yourself. Throws if you give both, neither, or a
 * model that is not one of `AGENTS`.
 */
export const agentCommand = (opts: AgentOptions): Agent => {
	if (opts.exec !== undefined) {
		if (opts.agent !== undefined) {
			throw new Error("--agent and --exec both name an agent, so pass one");
		}
		// through a shell, so quoting and pipes in the command survive, with the
		// prompt as "$@" rather than spliced into the text of the command
		return { argv: ["sh", "-c", `${opts.exec} "$@"`, "sh"], label: opts.exec };
	}
	if (opts.agent === undefined) {
		// The config's `agent` is where a default comes from, so reaching here
		// means neither the caller nor the config named one. Names no command:
		// this is shared by every caller that spawns an agent, and naming one of
		// them is how the message goes stale.
		throw new Error(
			"a run needs an agent, so say which: --agent " +
				`<${Object.keys(AGENTS).join("|")}>, --exec <command>, ` +
				"or --prompt to print the prompts and run nothing",
		);
	}
	const name = opts.agent;
	const argv = AGENTS[name];
	if (!argv) {
		throw new Error(
			`no agent "${name}". Known agents: ${Object.keys(AGENTS).join(", ")}`,
		);
	}
	return { argv, label: argv.join(" ") };
};

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
 * Checks a directory against a config with an agent of the caller's choosing,
 * one task per glob the rules share and chunk of matching files, and
 * collecting what comes back as violations.
 */
export class Analyzer {
	// Rules sharing a glob share a task: the files are what a task costs, and a
	// handful of one-page rules over a bounded slice of them keeps the agent
	// reliable at a fraction of what one task per rule paid to read the same
	// files once per rule.

	// A file matched by several rules is read once, not once per finding.
	private lines = new Map<string, Promise<string[]>>();
	private dispatcher = new Dispatcher<AnalyzerEvents>();

	/** Fires `finished` per task, so a caller can print findings as they land. */
	readonly events: Events<AnalyzerEvents> = this.dispatcher.events;

	constructor(
		private log: Logger,
		private fs: Fs,
		private ps: Ps,
		private clock: Clock,
	) {}

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

	/**
	 * Spawns an agent for each task `plan` produced, `concurrency` of them at a
	 * time, dispatching `finished` as each returns. Resolves with every violation
	 * once the last agent is done.
	 */
	async run(
		tasks: Task[],
		dir: string,
		agent: Agent,
		concurrency: number = DEFAULT_CONCURRENCY,
	): Promise<Violation[]> {
		let done = 0;
		let next = 0;
		const found: Violation[][] = [];
		// A worker per slot, each taking the next task as it frees up, so a slow
		// task holds up only itself: the cap is the provider's rate limit, not
		// this machine's, since a call is latency and no local work.
		const worker = async (): Promise<void> => {
			for (let at = next++; at < tasks.length; at = next++) {
				const task = tasks[at];
				if (!task) {
					return;
				}
				const started = this.clock.now();
				const { violations, cost } = await this.spawn(task, dir, agent);
				done += 1;
				this.dispatcher.dispatch("finished", {
					glob: task.glob,
					rules: task.rules.map((rule) => rule.id),
					violations,
					took: this.clock.now().subtract(started),
					cost,
					done,
					total: tasks.length,
				});
				found[at] = violations;
			}
		};
		const slots = Math.max(1, Math.min(concurrency, tasks.length));
		await Promise.all(Array.from({ length: slots }, worker));
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
		for (const [glob, group] of groups) {
			const matcher = new Bun.Glob(glob);
			const files = all.filter((file) => matcher.match(file));
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
				const prompt = this.prompt(group, slice);
				tasks.push({
					rules: group,
					glob,
					files: slice,
					prompt,
					bytes: slice.reduce(
						(bytes, file) => bytes + (size.get(file) ?? 0),
						Buffer.byteLength(prompt),
					),
				});
			}
		}
		return tasks;
	}

	private async spawn(
		task: Task,
		dir: string,
		agent: Agent,
	): Promise<{ violations: Violation[]; cost?: number }> {
		const argv = [...agent.argv, task.prompt];
		const { exitCode, stdout, stderr } = await this.ps.spawnCapture(argv, {
			cwd: dir,
		});
		if (exitCode !== 0) {
			this.log.error(
				`agent exited ${exitCode} on ${task.glob}: ${stderr.trim() || "no stderr"}`,
			);
			return { violations: [] };
		}
		const reported = parse(stdout);
		if (reported === null) {
			this.log.error(
				`agent returned no JSON array on ${task.glob}: ${stdout.trim().slice(0, 200)}`,
			);
			return { violations: [] };
		}
		const violations: Violation[] = [];
		for (const report of reported.reports) {
			const rule = task.rules.find((candidate) => candidate.id === report.rule);
			if (!rule) {
				// Aloud, not dropped in silence: a finding filed under a misspelled
				// id is still a finding somebody paid for.
				this.log.error(
					`agent reported unknown rule "${report.rule}" on ${task.glob}`,
				);
				continue;
			}
			const file = join(dir, report.file);
			// The prompt asks the agent to honor markers; this is what enforces it.
			if (exemptions(await this.source(file), rule.id)(report.line)) {
				continue;
			}
			violations.push({
				id: rule.id,
				level: rule.level,
				file,
				line: report.line,
				message: report.message,
				// From disk, not from the agent: the quoted line is the reader's
				// evidence, and evidence a model wrote is no evidence at all.
				code: (await this.source(file))[report.line - 1]?.trim() ?? "",
			});
		}
		return { violations: violations.sort(cmp), cost: reported.cost };
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

	private prompt(rules: Rule[], files: string[]): string {
		const writer = new MarkdownWriter().text(
			`You are checking code against exactly ${rules.length} style ` +
				`rule${rules.length === 1 ? "" : "s"}, listed below. Apply only ` +
				"these rules; ignore every other style concern you notice.",
		);
		for (const rule of rules) {
			writer.text(`Rule \`${rule.id}\`, verbatim:`);
			writer.code("markdown", rule.document);
		}
		return writer
			.text("Check each of these files, relative to your working directory:")
			.text(files.map((file) => `- ${file}`).join("\n"))
			.text(
				[
					"Code excuses itself from a rule with a comment naming that rule's id:",
					"",
					"- `judge-ignore <id>: <reason>` excuses the line it sits above, " +
						"and everything indented under that line.",
					"- `judge-ignore-file <id>: <reason>` excuses the whole file.",
					"",
					"Report nothing an excused line does against the rule the marker names. " +
						"A marker excuses only that one rule, and a marker naming an id not " +
						"listed above excuses nothing here.",
				].join("\n"),
			)
			.text(
				[
					"Read the files yourself. Report every violation of any of these rules as an element of one JSON array:",
					"",
					'[{"rule": "<rule id>", "file": "<path as listed above>", "line": <1-based line number>, "message": "<how this code breaks the rule>"}]',
					"",
					'"message" states what the code does that the rule forbids, naming the ' +
						"construct it applies to. One clause, lowercase, no trailing period.",
					"",
					"Never say what to do about it. Deciding the fix belongs to the reader, " +
						"who knows things you do not. " +
						'Write "greet and greetAll each take a clock parameter", not ' +
						'"give them a constructor". Write "the comment restates the increment ' +
						'below it", not "delete the comment".',
					"",
					"Output only the JSON array and nothing else. No violations means [].",
				].join("\n"),
			)
			.toString();
	}
}

/** One violation as the agent filed it, before it is checked against the config. */
interface Report {
	rule: string;
	file: string;
	line: number;
	message: string;
}

/**
 * What an agent's stdout yielded: the violations it filed, and what the call
 * cost when the agent is one that says.
 */
function parse(stdout: string): { reports: Report[]; cost?: number } | null {
	// The envelope first: under --output-format json the whole of stdout is an
	// object whose "result" holds the answer, so scanning stdout for brackets
	// would find one inside the envelope rather than the agent's array.
	const envelope = wrapper(stdout);
	const reports = array(envelope?.result ?? stdout);
	return reports === null ? null : { reports, cost: envelope?.total_cost_usd };
}

/**
 * The `--output-format json` envelope, or undefined for stdout that is not one:
 * an `--exec` command answers with the array itself, and is priced by nobody.
 */
function wrapper(
	stdout: string,
): { result: string; total_cost_usd?: number } | undefined {
	let value: unknown;
	try {
		value = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (
		typeof value !== "object" ||
		value === null ||
		!("result" in value) ||
		typeof value.result !== "string"
	) {
		return undefined;
	}
	const cost = "total_cost_usd" in value ? value.total_cost_usd : undefined;
	return {
		result: value.result,
		total_cost_usd: typeof cost === "number" ? cost : undefined,
	};
}

/**
 * The agent's array, or null when there isn't one. Agents wrap their answer in
 * prose or a fence often enough that finding the outermost brackets beats
 * insisting the whole of the text parse.
 */
function array(text: string): Report[] | null {
	const start = text.indexOf("[");
	const end = text.lastIndexOf("]");
	if (start === -1 || end < start) {
		return null;
	}
	let value: unknown;
	try {
		value = JSON.parse(text.slice(start, end + 1));
	} catch {
		return null;
	}
	if (!Array.isArray(value)) {
		return null;
	}
	// A malformed element is dropped rather than printed as "undefined:NaN".
	return value.filter(
		(violation): violation is Report =>
			typeof violation === "object" &&
			violation !== null &&
			typeof violation.rule === "string" &&
			typeof violation.file === "string" &&
			typeof violation.line === "number" &&
			typeof violation.message === "string",
	);
}

const cmp = (left: Violation, right: Violation): number =>
	left.file.localeCompare(right.file) || left.line - right.line;
