import { Dispatcher, type Events } from "webappwiz/events";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import { NodePs, type Ps } from "webappwiz/system";
import { type Clock, type Duration, SystemClock } from "webappwiz/time";
import type { Agent } from "./agent";
import { DEFAULT_CONCURRENCY } from "./config";
import type { Finding } from "./finding";
import { prompt } from "./prompt";
import type { Review } from "./review";

/** One review's worth of findings, handed over the moment its agent returns. */
export interface Finished {
	/** The review's place in the list `run` was given. Labels repeat when a caller
	 * splits one subject across reviews, so this is what correlates an event back
	 * to the review that caused it. */
	at: number;
	/** The review's label, as the caller named it. */
	label: string;
	/** The ids of the rules the review checked. */
	rules: string[];
	findings: Finding[];
	/** How long this review's agent took. */
	took: Duration;
	/**
	 * Tokens this review's call touched, straight from the agent's envelope:
	 * input, output, and cache both ways. Undefined for an agent that reports
	 * no usage, which is any `--exec` command: reports leave the figure off
	 * rather than guess it.
	 */
	tokens?: number;
	/** Which pool slot ran the call, 0-based, so a caller can watch what each
	 * worker is spending as the run goes. */
	worker: number;
	/** True when the agent exited nonzero or answered with no array: empty
	 * findings from a failed call clear nothing. */
	failed: boolean;
	done: number;
	total: number;
}

/** What a run reports as it goes, for a caller that prints as findings land. */
export type HarnessEvents = {
	/** One review, the moment its agent returns. */
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
 * The harness knows nothing about where a review's material came from or what
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

	/** Fires `finished` per review, so a caller can print findings as they land. */
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
	 * Spawns an agent for each review, `concurrency` of them at a time,
	 * dispatching `finished` as each returns. Resolves with every finding once
	 * the last agent is done, in review order.
	 */
	async run(
		reviews: Review[],
		agent: Agent,
		{ cwd, concurrency = DEFAULT_CONCURRENCY }: RunOptions = {},
	): Promise<Finding[]> {
		let done = 0;
		let next = 0;
		const found: Finding[][] = [];
		// A worker per slot, each taking the next review as it frees up, so a slow
		// review holds up only itself: the cap is the provider's rate limit, not
		// this machine's, since a call is latency and no local work.
		const worker = async (slot: number): Promise<void> => {
			for (let at = next++; at < reviews.length; at = next++) {
				const review = reviews[at];
				if (!review) {
					return;
				}
				const started = this.clock.now();
				const { findings, tokens, failed } = await this.spawn(
					review,
					agent,
					cwd,
				);
				done += 1;
				this.dispatcher.dispatch("finished", {
					at,
					label: review.label,
					rules: review.rules.map((rule) => rule.id),
					findings,
					took: this.clock.now().subtract(started),
					tokens,
					worker: slot,
					failed,
					done,
					total: reviews.length,
				});
				found[at] = findings;
			}
		};
		const slots = Math.max(1, Math.min(concurrency, reviews.length));
		await Promise.all(Array.from({ length: slots }, (_, slot) => worker(slot)));
		return found.flat();
	}

	private async spawn(
		review: Review,
		agent: Agent,
		cwd?: string,
	): Promise<{ findings: Finding[]; tokens?: number; failed: boolean }> {
		const argv = [...agent.argv, prompt(review)];
		const { exitCode, stdout, stderr } = await this.ps.spawnCapture(argv, {
			cwd,
		});
		if (exitCode !== 0) {
			this.log.error(
				`agent exited ${exitCode} on ${review.label}: ${stderr.trim() || "no stderr"}`,
			);
			return { findings: [], failed: true };
		}
		const reported = parse(stdout);
		if (reported === null) {
			this.log.error(
				`agent returned no JSON array on ${review.label}: ${stdout.trim().slice(0, 200)}`,
			);
			return { findings: [], failed: true };
		}
		const findings: Finding[] = [];
		for (const report of reported.findings) {
			if (!review.rules.some((rule) => rule.id === report.rule)) {
				// Aloud, not dropped in silence: a finding filed under a misspelled
				// id is still a finding somebody paid for.
				this.log.error(
					`agent reported unknown rule "${report.rule}" on ${review.label}`,
				);
				continue;
			}
			findings.push(report);
		}
		return { findings, tokens: reported.tokens, failed: false };
	}
}

/**
 * The answer and what it read, out of whatever envelope the agent wrote it
 * in. `--output-format json` wraps the text in an object with a `usage`
 * beside it; an `--exec` command prints the array on its own and reports no
 * usage at all.
 */
function parse(
	stdout: string,
): { findings: Finding[]; tokens?: number } | null {
	const envelope = unwrap(stdout);
	const findings = array(envelope.result);
	return findings === null ? null : { findings, tokens: envelope.tokens };
}

function unwrap(stdout: string): { result: string; tokens?: number } {
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
	return {
		result: value.result,
		tokens: spent("usage" in value ? value.usage : undefined),
	};
}

/**
 * Every token a call touched, as one figure: input, output, and cache reads
 * and writes all count, because the question the report answers with it is
 * where the spend is going, not what any one kind costs.
 */
function spent(usage: unknown): number | undefined {
	if (typeof usage !== "object" || usage === null) {
		return undefined;
	}
	const total = Object.entries(usage)
		.filter(
			(entry): entry is [string, number] =>
				entry[0].endsWith("_tokens") && typeof entry[1] === "number",
		)
		.reduce((sum, [, count]) => sum + count, 0);
	return total > 0 ? total : undefined;
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
