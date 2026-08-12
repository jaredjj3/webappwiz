import { join } from "node:path";
import type { Logger } from "@webappwiz/log";
import { MarkdownWriter } from "@webappwiz/md";
import { type Fs, type Ps, walk } from "@webappwiz/sys";
import type { Clock, Duration } from "@webappwiz/time";
import type { Level } from "./diagnostic";
import { exemptions } from "./ignore";
import type { Rule } from "./rule/rule";
import { RuleDocument } from "./rule-document";

export interface Task {
	rule: Rule;
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
	/** The rule's referenceable id, as `lint show` lists it. */
	id: string;
	level: Level;
	/** Path as the caller would type it: the analyzed dir plus the file. */
	file: string;
	line: number;
	/** How this code breaks the rule. Never what to do about it. */
	message: string;
	/** That line of the file, read from disk rather than from the agent. */
	code: string;
}

/** One task's worth of findings, handed over the moment its agent returns. */
export interface Finished {
	rule: string;
	id: string;
	violations: Violation[];
	/** How long this task's agent took. */
	took: Duration;
	done: number;
	total: number;
}

/** What one task is handed to: the argv to spawn, and how reports name it. */
export interface Agent {
	argv: string[];
	label: string;
}

/** The models `--agent` names, so a run can pick one without a command. */
export const AGENTS: Record<string, string[]> = {
	haiku: ["claude", "-p", "--model", "haiku"],
	sonnet: ["claude", "-p", "--model", "sonnet"],
	opus: ["claude", "-p", "--model", "opus"],
};

/**
 * Resolves `--agent` and `--exec`, which are alternatives: name a model, or
 * give a command to run it yourself. Throws if you give both, neither, or a
 * model that is not one of `AGENTS`.
 */
export const agentCommand = (opts: {
	agent?: string;
	exec?: string;
}): Agent => {
	if (opts.exec !== undefined) {
		if (opts.agent !== undefined) {
			throw new Error("--agent and --exec both name an agent, so pass one");
		}
		// through a shell, so quoting and pipes in the command survive, with the
		// prompt as "$@" rather than spliced into the text of the command
		return { argv: ["sh", "-c", `${opts.exec} "$@"`, "sh"], label: opts.exec };
	}
	if (opts.agent === undefined) {
		// No default model: a run costs the caller's tokens, so who spends them is
		// theirs to say.
		throw new Error(
			"analyze runs an agent, so say which: --agent " +
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

/** What a run reports as it goes, for a caller that prints as findings land. */
export interface Events {
	/**
	 * The whole plan, before the first agent starts. Throwing from here cancels
	 * the run without spawning anything, which is how a caller refuses a plan it
	 * decides is too expensive.
	 */
	planned?: (tasks: Task[]) => void | Promise<void>;
	/** One task, the moment its agent returns. */
	finished?: (finished: Finished) => void;
}

/**
 * Checks a directory against a guide by handing each rule to an agent of
 * the caller's choosing, one task per rule and chunk of matching files, and
 * collecting what comes back as violations.
 */
export class Analyzer {
	// One rule per task is the point: an agent applying a single rule to a
	// bounded slice of files stays reliable where a whole guide over a whole repo
	// does not.

	// A file matched by several rules is read once, not once per rule filtering
	// it or per finding quoting it.
	private texts = new Map<string, Promise<string>>();

	constructor(
		private log: Logger,
		private fs: Fs,
		private ps: Ps,
		private clock: Clock,
	) {}

	/**
	 * Checks `dir` against `rules`, calling `on.finished` each time an agent
	 * returns so a caller can print findings as they land. Resolves with every
	 * violation once the last agent is done.
	 */
	async analyze(
		rules: Rule[],
		dir: string,
		chunk: number,
		agent: Agent,
		on: Events = {},
		only?: Set<string>,
	): Promise<Violation[]> {
		const tasks = await this.plan(rules, dir, chunk, only);
		await on.planned?.(tasks);
		let done = 0;
		// Every task at once: a guide's tasks number in the tens, and an agent
		// call is minutes of latency and no local work. Add a cap if that changes.
		const found = await Promise.all(
			tasks.map(async (task) => {
				const started = this.clock.now();
				const violations = await this.run(task, dir, agent);
				done += 1;
				on.finished?.({
					rule: new RuleDocument(task.rule).title,
					id: task.rule.id,
					violations,
					took: this.clock.now().subtract(started),
					done,
					total: tasks.length,
				});
				return violations;
			}),
		);
		return found.flat();
	}

	/**
	 * The tasks a run would spawn. `only` narrows it to those files, named the
	 * way the globs are, for a caller checking a subset of the tree rather than
	 * all of it; a rule matching nothing left in it is still worth saying so.
	 */
	async plan(
		rules: Rule[],
		dir: string,
		chunk: number,
		only?: Set<string>,
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
		const tasks: Task[] = [];
		for (const rule of rules) {
			const glob = new Bun.Glob(rule.files);
			const matched = all.filter((file) => glob.match(file));
			if (matched.length === 0) {
				// stderr, so the report on stdout stays parseable
				this.log.error(`rule "${rule.id}" matches no files under ${dir}`);
			}
			const files = await this.candidates(rule, dir, matched);
			// chunks are counted in files, not tokens: switch to a byte budget when
			// repos with a few huge files start overflowing a task.
			for (let i = 0; i < files.length; i += chunk) {
				const slice = files.slice(i, i + chunk);
				const prompt = this.prompt(rule, slice);
				tasks.push({
					rule,
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

	/**
	 * The matched files a rule could actually find something in. A rule with no
	 * `applies` gets all of them; one with it trades a local read for an agent
	 * reading the file. Keeping nothing is silent, unlike a glob matching
	 * nothing: an empty glob is a broken guide, an empty filter is a clean tree.
	 */
	private async candidates(
		rule: Rule,
		dir: string,
		files: string[],
	): Promise<string[]> {
		if (!rule.applies) {
			return files;
		}
		const kept = await Promise.all(
			files.map(async (file) =>
				rule.applies?.(await this.text(join(dir, file))) ? file : null,
			),
		);
		return kept.filter((file) => file !== null);
	}

	private async run(
		task: Task,
		dir: string,
		agent: Agent,
	): Promise<Violation[]> {
		const argv = [...agent.argv, task.prompt];
		const { exitCode, stdout, stderr } = await this.ps.spawnCapture(argv, {
			cwd: dir,
		});
		if (exitCode !== 0) {
			this.log.error(
				`agent exited ${exitCode} on rule "${task.rule.id}": ${stderr.trim() || "no stderr"}`,
			);
			return [];
		}
		const reported = parse(stdout);
		if (reported === null) {
			this.log.error(
				`agent returned no JSON array on rule "${task.rule.id}": ${stdout.trim().slice(0, 200)}`,
			);
			return [];
		}
		const violations: Violation[] = [];
		for (const report of reported) {
			const file = join(dir, report.file);
			// The prompt asks the agent to honor markers; this is what enforces it.
			if (exemptions(await this.source(file), task.rule.id)(report.line)) {
				continue;
			}
			violations.push({
				id: task.rule.id,
				level: task.rule.level,
				file,
				line: report.line,
				message: report.message,
				// From disk, not from the agent: the quoted line is the reader's
				// evidence, and evidence a model wrote is no evidence at all.
				code: (await this.source(file))[report.line - 1]?.trim() ?? "",
			});
		}
		return violations.sort(cmp);
	}

	private text(file: string): Promise<string> {
		let text = this.texts.get(file);
		if (!text) {
			text = this.fs.read(file).catch(() => "");
			this.texts.set(file, text);
		}
		return text;
	}

	private async source(file: string): Promise<string[]> {
		return (await this.text(file)).split("\n");
	}

	private prompt(rule: Rule, files: string[]): string {
		return new MarkdownWriter()
			.text(
				"You are checking code against exactly one style rule. " +
					"Apply only this rule; ignore every other style concern you notice.",
			)
			.text("The rule, verbatim:")
			.code("markdown", rule.document)
			.text("Check each of these files, relative to your working directory:")
			.text(files.map((file) => `- ${file}`).join("\n"))
			.text(
				[
					`This rule's id is \`${rule.id}\`. Code excuses itself from it with a comment:`,
					"",
					`- \`lint-ignore ${rule.id}: <reason>\` excuses the line it sits above, ` +
						"and everything indented under that line.",
					`- \`lint-ignore-file ${rule.id}: <reason>\` excuses the whole file.`,
					"",
					"Report nothing an excused line does. A marker naming another rule's id " +
						"excuses nothing here.",
				].join("\n"),
			)
			.text(
				[
					"Read the files yourself. Report every violation of the rule as an element of one JSON array:",
					"",
					'[{"file": "<path as listed above>", "line": <1-based line number>, "message": "<how this code breaks the rule>"}]',
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

/**
 * The agent's array, or null when there isn't one. Agents wrap their answer in
 * prose or a fence often enough that finding the outermost brackets beats
 * insisting the whole of stdout parse.
 */
function parse(
	stdout: string,
): Array<{ file: string; line: number; message: string }> | null {
	const start = stdout.indexOf("[");
	const end = stdout.lastIndexOf("]");
	if (start === -1 || end < start) {
		return null;
	}
	let value: unknown;
	try {
		value = JSON.parse(stdout.slice(start, end + 1));
	} catch {
		return null;
	}
	if (!Array.isArray(value)) {
		return null;
	}
	// A malformed element is dropped rather than printed as "undefined:NaN".
	return value.filter(
		(violation): violation is { file: string; line: number; message: string } =>
			typeof violation === "object" &&
			violation !== null &&
			typeof violation.file === "string" &&
			typeof violation.line === "number" &&
			typeof violation.message === "string",
	);
}

const cmp = (left: Violation, right: Violation): number =>
	left.file.localeCompare(right.file) || left.line - right.line;
