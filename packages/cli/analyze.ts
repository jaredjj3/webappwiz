import { join } from "node:path";
import type { Logger } from "@webappwiz/log";
import { MarkdownWriter } from "@webappwiz/md";
import { exemptions, type Level, type Rule } from "@webappwiz/style";
import type { Fs, Ps } from "@webappwiz/sys";
import type { Clock, Duration } from "@webappwiz/time";
import { walk } from "./walk";

export interface Task {
	rule: Rule;
	files: string[];
	prompt: string;
}

/** One rule broken in one place, as the report prints it. */
export interface Violation {
	/** The rule's referenceable id, as `style show` lists it. */
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

/** The model a run uses when it names neither an agent nor a command. */
export const DEFAULT_AGENT = "sonnet";

/**
 * Resolves `--agent` and `--exec`, which are alternatives: name a model, or
 * give a command to run it yourself. Throws if you give both, or a model that
 * is not one of `AGENTS`.
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
	const name = opts.agent ?? DEFAULT_AGENT;
	const argv = AGENTS[name];
	if (!argv) {
		throw new Error(
			`no agent "${name}". Known agents: ${Object.keys(AGENTS).join(", ")}`,
		);
	}
	return { argv, label: argv.join(" ") };
};

export const count = (n: number, word: string): string =>
	`${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Checks a directory against a style guide by handing each rule to an agent of
 * the caller's choosing, one task per rule and chunk of matching files, and
 * collecting what comes back as violations.
 */
export class Analyzer {
	// One rule per task is the point: an agent applying a single rule to a
	// bounded slice of files stays reliable where a whole guide over a whole repo
	// does not.

	// A file matched by several rules is read once, not once per finding.
	private lines = new Map<string, Promise<string[]>>();

	constructor(
		private log: Logger,
		private fs: Fs,
		private ps: Ps,
		private clock: Clock,
	) {}

	/**
	 * Checks `dir` against `rules`, calling `onFinished` each time an agent
	 * returns so a caller can print findings as they land. Resolves with every
	 * violation once the last agent is done.
	 */
	async analyze(
		rules: Rule[],
		dir: string,
		chunk: number,
		agent: Agent,
		onFinished: (finished: Finished) => void = () => {},
	): Promise<Violation[]> {
		const tasks = await this.plan(rules, dir, chunk);
		const files = new Set(tasks.flatMap((t) => t.files)).size;
		this.log.info(
			`checking ${count(files, "file")} against ${count(rules.length, "rule")} in ${count(tasks.length, "task")}, using: ${agent.label}`,
		);
		let done = 0;
		// Every task at once: a guide's tasks number in the tens, and an agent
		// call is minutes of latency and no local work. Add a cap if that changes.
		const found = await Promise.all(
			tasks.map(async (task) => {
				const started = this.clock.now();
				const violations = await this.run(task, dir, agent);
				done += 1;
				onFinished({
					rule: task.rule.name,
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
				// stderr, so the report on stdout stays parseable
				this.log.error(`rule "${rule.name}" matches no files under ${dir}`);
			}
			// chunks are counted in files, not tokens: switch to a byte budget when
			// repos with a few huge files start overflowing a task.
			for (let i = 0; i < files.length; i += chunk) {
				const slice = files.slice(i, i + chunk);
				tasks.push({ rule, files: slice, prompt: this.prompt(rule, slice) });
			}
		}
		return tasks;
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
				`agent exited ${exitCode} on rule "${task.rule.name}": ${stderr.trim() || "no stderr"}`,
			);
			return [];
		}
		const reported = parse(stdout);
		if (reported === null) {
			this.log.error(
				`agent returned no JSON array on rule "${task.rule.name}": ${stdout.trim().slice(0, 200)}`,
			);
			return [];
		}
		const violations: Violation[] = [];
		for (const r of reported) {
			const file = join(dir, r.file);
			// The prompt asks the agent to honor markers; this is what enforces it.
			if (exemptions(await this.source(file), task.rule.id)(r.line)) {
				continue;
			}
			violations.push({
				id: task.rule.id,
				level: task.rule.level,
				file,
				line: r.line,
				message: r.message,
				// From disk, not from the agent: the quoted line is the reader's
				// evidence, and evidence a model wrote is no evidence at all.
				code: (await this.source(file))[r.line - 1]?.trim() ?? "",
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

	private prompt(rule: Rule, files: string[]): string {
		return new MarkdownWriter()
			.text(
				"You are checking code against exactly one style rule. " +
					"Apply only this rule; ignore every other style concern you notice.",
			)
			.text("The rule, verbatim:")
			.code("markdown", rule.text)
			.text("Check each of these files, relative to your working directory:")
			.text(files.map((f) => `- ${f}`).join("\n"))
			.text(
				[
					`This rule's id is \`${rule.id}\`. Code excuses itself from it with a comment:`,
					"",
					`- \`style-ignore ${rule.id}: <reason>\` excuses the line it sits above, ` +
						"and everything indented under that line.",
					`- \`style-ignore-file ${rule.id}: <reason>\` excuses the whole file.`,
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
		(v): v is { file: string; line: number; message: string } =>
			typeof v === "object" &&
			v !== null &&
			typeof v.file === "string" &&
			typeof v.line === "number" &&
			typeof v.message === "string",
	);
}

const cmp = (a: Violation, b: Violation): number =>
	a.file.localeCompare(b.file) || a.line - b.line;
