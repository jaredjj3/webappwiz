import { ConsoleLogger, color, type Logger } from "@webappwiz/log";
import {
	type Agent,
	type AgentOptions,
	agentCommand,
	type FileRule,
	Files,
	type FileTask,
	Harness,
	type Rule,
	type RuleSet,
	prompt as taskPrompt,
	type Violation,
} from "@webappwiz/rules";
import {
	type Fs,
	type Glob,
	NodeFs,
	NodeGlob,
	NodePs,
	type Ps,
} from "@webappwiz/sys";
import { type Clock, SystemClock } from "@webappwiz/time";
import { changed } from "./changed";
import { calibrate, floor, overheads, predict } from "./cost";
import { mode } from "./mode";
import {
	count,
	divider,
	estimate,
	finished,
	overBudget,
	planned,
	summary,
	tokens,
} from "./report";
import { table } from "./table";

/** Asked before a run spends more than it was allowed to. */
export interface Confirm {
	confirm(question: string): boolean | Promise<boolean>;
}

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
	/** Print what a run would read and stop. */
	estimate?: boolean;
	/** Files per task. */
	chunk: number;
	/** Narrows the run to what git says has changed since this ref. */
	since?: string;
	/** Tokens a run may read before it asks whether you meant it. */
	budget: number;
}

/** What a whole plan reads: every task's prompt and the files it names. */
const estimated = (tasks: FileTask[]): number =>
	tokens(tasks.reduce((bytes, task) => bytes + task.bytes, 0));

/** Whether a rule is one a run checks files against, rather than one only a
 * reader applies. */
const isFileRule = (rule: Rule): rule is FileRule => "files" in rule;

/** A rule's title, off the first `# ` line of its document: the whole of what
 * a listing needs, without a markdown parser to get it. */
const title = (rule: Rule): string =>
	/^#\s+(.+)$/m.exec(rule.document)?.[1]?.trim() ?? rule.id;

/**
 * Answers on the terminal, and answers no without one: a run nobody is watching
 * should stop and say the number rather than block forever waiting to be told
 * to go ahead.
 */
export const ask: Confirm = {
	confirm: (question) =>
		process.stdin.isTTY === true &&
		/^y(es)?$/i.test((prompt(`${question} [y/N]`) ?? "").trim()),
};

/** What a `JudgeCommands` runs through, and what else it lists. */
export interface JudgeCommandsOptions {
	/** Rules only a reader applies, listed beside the ones a run checks. */
	signoffRules?: Rule[];
	/** Who is asked before a run goes over budget; the terminal by default. */
	confirmer?: Confirm;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	clock?: Clock;
	glob?: Glob;
}

export class JudgeCommands {
	private signoffRules: Rule[];
	private confirmer: Confirm;
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
		this.confirmer = opts.confirmer ?? ask;
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
	 * `since` narrows the run to what git says has changed, and `budget` caps
	 * what it may read before asking whether you meant it. Under `estimate` it
	 * prints that size and stops, which is the answer to "what would this cost"
	 * without having to guess a budget low enough to be refused.
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
		const tasks = await files.plan(rules, dir, {
			chunk: opts.chunk,
			only,
		});
		if (how === "print") {
			for (const task of tasks) {
				this.log.info(
					`\n${divider(`${task.label} (${count(task.files.length, "file")})`)}\n`,
				);
				this.log.info(taskPrompt(task));
			}
			this.log.info(`\n${divider()}`);
			return;
		}
		const read = new Set(tasks.flatMap((task) => task.files)).size;
		const predicted = estimated(tasks);
		const calls = tasks.length;
		if (how === "estimate") {
			// No budget check: being asked to approve a number is what running
			// --estimate is instead of.
			for (const line of estimate(
				read,
				rules.length,
				calls,
				predicted,
				await overheads(this.ps.cwd(), { fs: this.fs }),
			)) {
				this.log.info(line);
			}
			return;
		}
		const agent = this.agent(config, opts);
		// What the cost is predicted from and recorded against, which is the
		// config's model as readily as one the caller named.
		const model = this.model(config, opts);
		// Against where wiz was run rather than the directory being judged: what
		// a call costs over its files is a fact about this project, and judging
		// one package of it should leave the measurement where the next run of any
		// scope will find it.
		const root = this.ps.cwd();
		const measured = await overheads(root, { fs: this.fs });
		const started = this.clock.now();
		// Priced whether or not it is over budget: what a run will cost is worth
		// knowing every time, not only on the runs that trip a limit.
		const cost =
			model === undefined
				? undefined
				: predict(model, predicted, calls, measured);
		this.log.info(
			planned({
				files: read,
				rules: rules.length,
				calls,
				estimate: predicted,
				concurrency: config.concurrency,
				cost,
				agent: agent.label,
			}).join("\n"),
		);
		if (predicted > opts.budget) {
			this.log.info(overBudget(predicted, opts.budget, cost));
			if (!(await this.confirmer.confirm("Run anyway?"))) {
				// Throwing before run is what cancels: nothing has been spawned yet.
				throw new Error("over budget");
			}
		}

		let spent = 0;
		let billed = false;
		const found: Violation[][] = [];
		const harness = new Harness({
			log: this.log,
			ps: this.ps,
			clock: this.clock,
		});
		harness.events.on("finished", (task) => {
			if (task.cost !== undefined) {
				spent += task.cost;
				billed = true;
			}
			const at = tasks[task.at];
			if (!at) {
				return;
			}
			// Sync, off what the plan already read, so a task's findings print the
			// moment its agent returns rather than waiting on a second pass.
			const violations = files.violations(at, task.findings, dir);
			found[task.at] = violations;
			for (const line of finished({
				rules: task.rules,
				files: at.files.length,
				violations,
				took: task.took,
				cost: task.cost,
				done: task.done,
				total: task.total,
			})) {
				this.log.info(line);
			}
		});
		await harness.run(tasks, agent, {
			cwd: dir,
			concurrency: config.concurrency,
		});
		const violations = found.flat();
		this.log.info("");
		this.log.info(
			summary(
				violations,
				this.clock.now().subtract(started),
				billed ? spent : undefined,
			),
		);
		await this.record(
			model,
			root,
			predicted,
			calls,
			billed ? spent : undefined,
		);
		const errors = violations.filter(
			(violation) => violation.level === "error",
		).length;
		if (errors > 0) {
			throw new Error(count(errors, "error"));
		}
	}

	/**
	 * Measures what one call cost over the files it was handed and leaves that
	 * behind, so the next `--estimate` on this agent has something better than a
	 * floor. Per call rather than per token, because that is how the charge
	 * falls: an agent pays for its own system prompt once per spawn, whatever it
	 * was asked to read, so a figure taken from a two-call run still holds for a
	 * fifteen-call one.
	 *
	 * A run nobody priced records nothing, and a failed write is said aloud
	 * rather than thrown: the agents have already been paid for by this point,
	 * and losing the measurement costs the next estimate accuracy, not the run.
	 */
	private async record(
		agent: string | undefined,
		root: string,
		predicted: number,
		calls: number,
		spent?: number,
	): Promise<void> {
		if (agent === undefined || spent === undefined || calls <= 0) {
			return;
		}
		const listed = floor(agent, predicted);
		if (listed === undefined) {
			return;
		}
		const call = (spent - listed) / calls;
		if (call <= 0) {
			// Billed less than the files alone were priced at, so this run says
			// nothing about the overhead. Leave any earlier measurement alone.
			return;
		}
		try {
			await calibrate(root, agent, call, { fs: this.fs });
		} catch (error) {
			this.log.error(`could not record what this run cost: ${error}`);
		}
	}

	/** The agent a command runs with: what it was told, else the config's. */
	private agent(config: RuleSet, opts: AgentOptions): Agent {
		const model = this.model(config, opts);
		return agentCommand(model === undefined ? opts : { agent: model });
	}

	/** The model a run asks, or undefined for an `--exec` command, which is a
	 * model nothing here can name or price. */
	private model(config: RuleSet, opts: AgentOptions): string | undefined {
		return opts.exec === undefined ? (opts.agent ?? config.agent) : undefined;
	}
}
