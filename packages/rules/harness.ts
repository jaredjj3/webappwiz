import { Dispatcher, type Events } from "@webappwiz/events";
import { ConsoleLogger, type Logger } from "@webappwiz/log";
import { NodePs, type Ps } from "@webappwiz/sys";
import { type Clock, type Duration, SystemClock } from "@webappwiz/time";
import type { Agent } from "./agent";
import { DEFAULT_CONCURRENCY } from "./config";
import type { Finding } from "./finding";
import { prompt } from "./prompt";
import type { Task } from "./task";

/** One task's worth of findings, handed over the moment its agent returns. */
export interface Finished {
	/** The task's place in the list `run` was given. Labels repeat when a caller
	 * splits one subject across tasks, so this is what correlates an event back
	 * to the task that caused it. */
	at: number;
	/** The task's label, as the caller named it. */
	label: string;
	/** The ids of the rules the task checked. */
	rules: string[];
	findings: Finding[];
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

/** What a run reports as it goes, for a caller that prints as findings land. */
export type HarnessEvents = {
	/** One task, the moment its agent returns. */
	finished: Finished;
};

/** Where a run happens and how many calls it may have going. */
export interface RunOptions {
	/** The directory the agent is spawned in, and that its material is relative
	 * to. The caller's working directory unless it says otherwise. */
	cwd?: string;
	concurrency?: number;
}

/**
 * Runs rules past an agent and collects what it says, a bounded number of
 * calls at a time.
 *
 * The harness knows nothing about where a task's material came from or what
 * its findings mean. It assembles a prompt, spawns the agent, checks that the
 * rules it reports are rules it was given, and hands the findings back.
 */
/** What a `Harness` runs through; the real ones by default. */
export interface HarnessOptions {
	log?: Logger;
	ps?: Ps;
	clock?: Clock;
}

export class Harness {
	private dispatcher = new Dispatcher<HarnessEvents>();

	/** Fires `finished` per task, so a caller can print findings as they land. */
	readonly events: Events<HarnessEvents> = this.dispatcher.events;

	private log: Logger;
	private ps: Ps;
	private clock: Clock;

	constructor(opts: HarnessOptions = {}) {
		this.log = opts.log ?? new ConsoleLogger();
		this.ps = opts.ps ?? new NodePs();
		this.clock = opts.clock ?? new SystemClock();
	}

	/**
	 * Spawns an agent for each task, `concurrency` of them at a time,
	 * dispatching `finished` as each returns. Resolves with every finding once
	 * the last agent is done, in task order.
	 */
	async run(
		tasks: Task[],
		agent: Agent,
		{ cwd, concurrency = DEFAULT_CONCURRENCY }: RunOptions = {},
	): Promise<Finding[]> {
		let done = 0;
		let next = 0;
		const found: Finding[][] = [];
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
				const { findings, cost } = await this.spawn(task, agent, cwd);
				done += 1;
				this.dispatcher.dispatch("finished", {
					at,
					label: task.label,
					rules: task.rules.map((rule) => rule.id),
					findings,
					took: this.clock.now().subtract(started),
					cost,
					done,
					total: tasks.length,
				});
				found[at] = findings;
			}
		};
		const slots = Math.max(1, Math.min(concurrency, tasks.length));
		await Promise.all(Array.from({ length: slots }, worker));
		return found.flat();
	}

	private async spawn(
		task: Task,
		agent: Agent,
		cwd?: string,
	): Promise<{ findings: Finding[]; cost?: number }> {
		const argv = [...agent.argv, prompt(task)];
		const { exitCode, stdout, stderr } = await this.ps.spawnCapture(argv, {
			cwd,
		});
		if (exitCode !== 0) {
			this.log.error(
				`agent exited ${exitCode} on ${task.label}: ${stderr.trim() || "no stderr"}`,
			);
			return { findings: [] };
		}
		const reported = parse(stdout);
		if (reported === null) {
			this.log.error(
				`agent returned no JSON array on ${task.label}: ${stdout.trim().slice(0, 200)}`,
			);
			return { findings: [] };
		}
		const findings: Finding[] = [];
		for (const report of reported.findings) {
			if (!task.rules.some((rule) => rule.id === report.rule)) {
				// Aloud, not dropped in silence: a finding filed under a misspelled
				// id is still a finding somebody paid for.
				this.log.error(
					`agent reported unknown rule "${report.rule}" on ${task.label}`,
				);
				continue;
			}
			findings.push(report);
		}
		return { findings, cost: reported.cost };
	}
}

/**
 * The answer and what it was billed, out of whatever envelope the agent wrote
 * it in. `--output-format json` wraps the text in an object with the cost
 * beside it; an `--exec` command prints the array on its own and reports no
 * money at all.
 */
function parse(stdout: string): { findings: Finding[]; cost?: number } | null {
	const envelope = unwrap(stdout);
	const findings = array(envelope.result);
	return findings === null ? null : { findings, cost: envelope.total_cost_usd };
}

function unwrap(stdout: string): { result: string; total_cost_usd?: number } {
	let value: unknown;
	try {
		value = JSON.parse(stdout);
	} catch {
		return { result: stdout };
	}
	if (
		typeof value !== "object" ||
		value === null ||
		!("result" in value) ||
		typeof value.result !== "string"
	) {
		return { result: stdout };
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
function array(text: string): Finding[] | null {
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
		(finding): finding is Finding =>
			typeof finding === "object" &&
			finding !== null &&
			typeof finding.rule === "string" &&
			typeof finding.message === "string" &&
			["string", "undefined"].includes(typeof finding.file) &&
			["number", "undefined"].includes(typeof finding.line) &&
			["number", "undefined"].includes(typeof finding.column),
	);
}
