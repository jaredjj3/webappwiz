import {
	type Agent,
	type AgentOptions,
	agentCommand,
	type FileReview,
	type FileRule,
	Files,
	Harness,
	type Rule,
	type RuleSet,
	prompt as reviewPrompt,
	type Violation,
} from "@webappwiz/rules";
import { ConsoleLogger, color, type Logger } from "webappwiz/log";
import {
	type Fs,
	type Glob,
	NodeFs,
	NodeGlob,
	NodePs,
	type Ps,
} from "webappwiz/system";
import { type Clock, SystemClock } from "webappwiz/time";
import { changed } from "./changed";
import { mode } from "./mode";
import { count, divider, finished, planned, summary, tokens } from "./report";
import { table } from "./table";

export interface ShowOptions {
	/** The rule to print, as `rules ls` lists it. */
	id: string;
}

export interface JudgeOptions {
	/** The directory to check, and what paths in the report are relative to. */
	dir: string;
	agent?: string;
	exec?: string;
	/** Print the prompts to the logger and spawn nothing. */
	print?: boolean;
	/** Files per review. */
	chunk: number;
	/** Narrows the run to what git says has changed since this ref. */
	since?: string;
	/** Agent calls in flight at once, over the config's `concurrency`. */
	"concurrency-override"?: number;
}

/** What a whole plan reads: every review's prompt and the files it names. */
const estimated = (reviews: FileReview[]): number =>
	tokens(reviews.reduce((bytes, review) => bytes + review.bytes, 0));

/** Whether a rule is one a run checks files against, rather than one only a
 * reader applies. */
const isFileRule = (rule: Rule): rule is FileRule => "files" in rule;

/** A rule's title, off the first `# ` line of its document: the whole of what
 * a listing needs, without a markdown parser to get it. */
const title = (rule: Rule): string =>
	/^#\s+(.+)$/m.exec(rule.document)?.[1]?.trim() ?? rule.id;

/** What a `JudgeCommands` runs through, and what else it lists. */
export interface JudgeCommandsOptions {
	/** Rules only a reader applies, listed beside the ones a run checks. */
	signoffRules?: Rule[];
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	clock?: Clock;
	glob?: Glob;
}

export class JudgeCommands {
	private signoffRules: Rule[];
	private log: Logger;
	private fs: Fs;
	private ps: Ps;
	private clock: Clock;
	private glob: Glob;

	constructor(
		private rules: RuleSet,
		opts: JudgeCommandsOptions = {},
	) {
		this.signoffRules = opts.signoffRules ?? [];
		this.log = opts.log ?? new ConsoleLogger();
		this.fs = opts.fs ?? new NodeFs();
		this.ps = opts.ps ?? new NodePs();
		this.clock = opts.clock ?? new SystemClock();
		this.glob = opts.glob ?? new NodeGlob();
	}

	/**
	 * Lists every rule there is, one row each, ids first for citing. The rules a
	 * run checks and the ones only a reader applies are one list with a SET
	 * column, because "what rules are there" is one question.
	 */
	ls(): void {
		const rows = [["id", "rule", "set", "level", "files"].map(color.dim)];
		for (const rule of this.rules.rules) {
			rows.push([rule.id, title(rule), "judge", rule.level, rule.files]);
		}
		for (const rule of this.signoffRules) {
			rows.push([rule.id, title(rule), "signoff", "", ""]);
		}
		this.log.info(table(rows).join("\n"));
	}

	/**
	 * Prints one rule in full: what it covers, and the document an agent is
	 * given, verbatim. Take the id from `rules ls` or from a finding. This is
	 * how a reader applies a rule nothing runs for them.
	 */
	show(opts: ShowOptions): void {
		const all: Rule[] = [...this.rules.rules, ...this.signoffRules];
		const rule = all.find((candidate) => candidate.id === opts.id);
		if (!rule) {
			throw new Error(
				`no rule "${opts.id}". Known ids: ${all.map((candidate) => candidate.id).join(", ")}`,
			);
		}
		const rows = [
			[color.dim("id"), rule.id],
			[color.dim("rule"), title(rule)],
		];
		if (isFileRule(rule)) {
			rows.push(
				[color.dim("level"), rule.level],
				[color.dim("files"), rule.files],
			);
		}
		this.log.info(table(rows).join("\n"));
		this.log.info("");
		this.log.info(rule.document.trim());
	}

	/**
	 * Runs the rules over a directory with the agent you name, as `agent` or
	 * `exec`, falling back to the config's. Exits 1 on any error. Under `print`
	 * it spawns nothing and prints the prompts instead, for an agent that would
	 * rather hand them to subagents of its own.
	 *
	 * `since` narrows the run to what git says has changed.
	 */
	async judge(opts: JudgeOptions): Promise<void> {
		const how = mode(opts);
		const config = this.rules;
		// Every rule goes in: planning runs the free checks first and sends the
		// agent only the files they escalated.
		const rules = config.rules;
		const dir = opts.dir.replace(/\/+$/, "") || "/";
		const only =
			opts.since === undefined
				? undefined
				: await changed(dir, opts.since, { ps: this.ps });
		if (only?.size === 0) {
			// Ahead of planning, so a no-op run says one clear thing rather than
			// one "matches no files" per rule.
			this.log.info(`nothing has changed since ${opts.since}`);
			return;
		}
		const files = new Files({ log: this.log, fs: this.fs, glob: this.glob });
		const reviews = await files.plan(rules, dir, {
			chunk: opts.chunk,
			only,
		});
		if (how === "print") {
			for (const review of reviews) {
				this.log.info(
					`\n${divider(`${review.label} (${count(review.files.length, "file")})`)}\n`,
				);
				this.log.info(reviewPrompt(review));
			}
			this.log.info(`\n${divider()}`);
			return;
		}
		const read = new Set(reviews.flatMap((review) => review.files)).size;
		const agent = this.agent(config, opts);
		const concurrency = opts["concurrency-override"] ?? config.concurrency;
		const started = this.clock.now();
		this.log.info(
			planned({
				files: read,
				rules: rules.length,
				calls: reviews.length,
				estimate: estimated(reviews),
				concurrency,
				agent: agent.label,
			}).join("\n"),
		);

		const found: Violation[][] = [];
		// Running totals, kept here rather than in the harness: what a worker has
		// spent so far is a fact about this report, not about running reviews.
		const byWorker = new Map<number, number>();
		let spent: number | undefined;
		const harness = new Harness({
			log: this.log,
			ps: this.ps,
			clock: this.clock,
		});
		harness.events.on("finished", (review) => {
			const at = reviews[review.at];
			if (!at) {
				return;
			}
			let workerTokens: number | undefined;
			if (review.tokens !== undefined) {
				workerTokens = (byWorker.get(review.worker) ?? 0) + review.tokens;
				byWorker.set(review.worker, workerTokens);
				spent = (spent ?? 0) + review.tokens;
			}
			// Sync, off what the plan already read, so a review's findings print the
			// moment its agent returns rather than waiting on a second pass.
			const violations = files.violations(at, review.findings, dir);
			found[review.at] = violations;
			for (const line of finished({
				rules: review.rules,
				files: at.files.length,
				violations,
				took: review.took,
				tokens: review.tokens,
				worker: review.worker,
				workerTokens,
				done: review.done,
				total: review.total,
			})) {
				this.log.info(line);
			}
		});
		await harness.run(reviews, agent, { cwd: dir, concurrency });
		const violations = found.flat();
		this.log.info("");
		this.log.info(
			summary(violations, this.clock.now().subtract(started), spent),
		);
		const errors = violations.filter(
			(violation) => violation.level === "error",
		).length;
		if (errors > 0) {
			throw new Error(count(errors, "error"));
		}
	}

	/** The agent a command runs with: what it was told, else the config's. */
	private agent(config: RuleSet, opts: AgentOptions): Agent {
		return agentCommand(
			opts.exec === undefined ? { agent: opts.agent ?? config.agent } : opts,
		);
	}
}
