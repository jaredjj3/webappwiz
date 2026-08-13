import {
	type Agent,
	type AgentOptions,
	Analyzer,
	agentCommand,
	type Config,
	type ConfigDiagnostic,
	type ConfigLoader,
	Configs,
	Mechanizer,
	RuleDocument,
	type Task,
} from "@webappwiz/judge";
import type { Logger } from "@webappwiz/log";
import type { Fs, Glob, Ps } from "@webappwiz/sys";
import type { Clock } from "@webappwiz/time";
import { changed } from "./changed";
import { calibrate, floor, overheads, predict } from "./cost";
import {
	count,
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

/** Which config to read, which every command here needs first. */
export interface ConfigOptions {
	/** The config module to load, as `rules ls` takes it. */
	config: string;
}

export interface AuditOptions extends ConfigOptions {
	/** Whether a warning fails the run, as an error always does. */
	strict: boolean;
	/** The model to ask, one of `AGENTS`; `exec` instead names a command.
	 * Neither means the config's `agent`. */
	agent?: string;
	exec?: string;
}

export interface ShowOptions extends ConfigOptions {
	/** The rule to print, as `rules ls` lists it. */
	id: string;
}

export interface JudgeOptions extends ConfigOptions {
	/** The directory to check, and what paths in the report are relative to. */
	dir: string;
	agent?: string;
	exec?: string;
	/** Print the prompts and spawn nothing. */
	prompt?: boolean;
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
const estimated = (tasks: Task[]): number =>
	tokens(tasks.reduce((bytes, task) => bytes + task.bytes, 0));

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

export class JudgeCommands {
	constructor(
		private log: Logger,
		private fs: Fs,
		private ps: Ps,
		private clock: Clock,
		private glob: Glob,
		private loader?: ConfigLoader,
		private confirmer: Confirm = ask,
	) {}

	/**
	 * Everything wrong with the config itself: compile diagnostics, and a warning
	 * for each rule an agent says a linter, formatter, type checker or grep
	 * could enforce instead. Exits 1 on errors, and on warnings only under
	 * `strict`: moving a rule out of the config is a decision to make once, not a
	 * build failure by surprise.
	 */
	async audit(opts: AuditOptions): Promise<void> {
		// Both halves every time, rather than a flag: which rules a tool could
		// take over is the question worth asking, and a config that will not
		// compile is the thing that stops it being asked.
		const { config, diagnostics } = await this.config(opts.config);
		if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
			// Before any agent runs: a config that will not compile is not worth
			// spending calls on, and the errors are the more urgent report.
			this.report(config.rules.length, diagnostics, opts.strict);
		}
		const mechanizer = new Mechanizer(this.log, this.ps);
		// Rules carrying a check are already mechanized: only the agent-judged
		// ones are worth asking about.
		diagnostics.push(
			...(await mechanizer.check(
				config.rules.filter((rule) => !rule.check),
				this.agent(config, opts),
			)),
		);
		this.report(config.rules.length, diagnostics, opts.strict);
	}

	/** Lists a config's rules, one row each, ids first for citing. */
	async ls(opts: ConfigOptions): Promise<void> {
		const { rules } = await this.sound(opts.config);
		const rows = [["ID", "RULE", "LEVEL", "FILES", "CHECK", "GOOD", "BAD"]];
		for (const rule of rules) {
			const doc = new RuleDocument(rule);
			rows.push([
				rule.id,
				doc.title,
				rule.level,
				rule.files,
				// which rules cost tokens: a checked rule is decided locally, free
				rule.check ? (rule.partial ? "partial" : "full") : "",
				String(doc.good.length),
				String(doc.bad.length),
			]);
		}
		this.log.info(table(rows).join("\n"));
	}

	/**
	 * Prints one rule in full: what it covers, and the document an analysis
	 * agent is given, verbatim. Take the id from `rules ls` or from a finding.
	 */
	async show(opts: ShowOptions): Promise<void> {
		const { rules } = await this.sound(opts.config);
		const rule = rules.find((candidate) => candidate.id === opts.id);
		if (!rule) {
			throw new Error(
				`no rule "${opts.id}" in ${opts.config}. Known ids: ${rules.map((candidate) => candidate.id).join(", ")}`,
			);
		}
		this.log.info(
			table([
				["ID", rule.id],
				["RULE", new RuleDocument(rule).title],
				["LEVEL", rule.level],
				["FILES", rule.files],
			]).join("\n"),
		);
		this.log.info("");
		this.log.info(rule.document.trim());
	}

	/**
	 * Runs the config over a directory with the agent you name, as `agent` or
	 * `exec`; there is no default. Exits 1 on any error. Under `prompt` it
	 * spawns nothing and prints the prompts instead, for an agent that would
	 * rather hand them to subagents of its own.
	 *
	 * `since` narrows the run to what git says has changed, and `budget` caps
	 * what it may read before asking whether you meant it. Under `estimate` it
	 * prints that size and stops, which is the answer to "what would this cost"
	 * without having to guess a budget low enough to be refused.
	 */
	async judge(opts: JudgeOptions): Promise<void> {
		if (
			opts.estimate &&
			(opts.agent !== undefined || opts.exec !== undefined || opts.prompt)
		) {
			// All three say what to do with the plan, and --estimate is already
			// doing something else with it. Letting one quietly win would leave a
			// caller unsure which of the two things they asked for they got.
			throw new Error(
				"--estimate measures a run instead of making one, so it takes no " +
					"--agent, --exec or --prompt",
			);
		}
		const config = await this.sound(opts.config);
		// A rule with a full check is already enforced locally, for free;
		// an agent reads only the rules, or the parts of them, no check decides.
		const rules = config.rules.filter((rule) => !rule.check || rule.partial);
		const dir = opts.dir.replace(/\/+$/, "") || "/";
		const only =
			opts.since === undefined
				? undefined
				: await changed(this.ps, dir, opts.since);
		if (only?.size === 0) {
			// Ahead of planning, so a no-op run says one clear thing rather than
			// one "matches no files" per rule.
			this.log.info(`nothing has changed since ${opts.since}`);
			return;
		}
		const analyzer = new Analyzer(
			this.log,
			this.fs,
			this.ps,
			this.clock,
			this.glob,
		);
		if (opts.prompt) {
			for (const task of await analyzer.plan(rules, dir, {
				chunk: opts.chunk,
				only,
			})) {
				this.log.info(
					`=== ${task.glob}: ${task.rules.map((rule) => rule.id).join(", ")} ` +
						`(${count(task.files.length, "file")}) ===`,
				);
				this.log.info(task.prompt);
			}
			return;
		}
		if (opts.estimate) {
			const tasks = await analyzer.plan(rules, dir, {
				chunk: opts.chunk,
				only,
			});
			const files = new Set(tasks.flatMap((task) => task.files)).size;
			// No budget check: being asked to approve a number is what running
			// --estimate is instead of.
			for (const line of estimate(
				files,
				rules.length,
				tasks.length,
				estimated(tasks),
				await overheads(this.fs, this.ps.cwd()),
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
		const measured = await overheads(this.fs, root);
		const started = this.clock.now();

		const tasks = await analyzer.plan(rules, dir, { chunk: opts.chunk, only });
		// What the plan predicted and what the agents were billed, which together
		// are the calibration this run leaves behind for the next --estimate.
		const files = new Set(tasks.flatMap((task) => task.files)).size;
		const predicted = estimated(tasks);
		const calls = tasks.length;
		this.log.info(planned(files, rules.length, calls, predicted, agent.label));
		if (predicted > opts.budget) {
			const cost =
				model === undefined
					? undefined
					: predict(model, predicted, calls, measured);
			this.log.info(overBudget(predicted, opts.budget, cost));
			if (!(await this.confirmer.confirm("Run anyway?"))) {
				// Throwing before run is what cancels: nothing has been spawned yet.
				throw new Error("over budget");
			}
		}

		let spent = 0;
		let billed = false;
		analyzer.events.on("finished", (task) => {
			if (task.cost !== undefined) {
				spent += task.cost;
				billed = true;
			}
			for (const line of finished(task)) {
				this.log.info(line);
			}
		});
		const violations = await analyzer.run(
			tasks,
			dir,
			agent,
			config.concurrency,
		);
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
			await calibrate(this.fs, root, agent, call);
		} catch (error) {
			this.log.error(`could not record what this run cost: ${error}`);
		}
	}

	/** The agent a command runs with: what it was told, else the config's. */
	private agent(config: Config, opts: AgentOptions): Agent {
		const model = this.model(config, opts);
		return agentCommand(model === undefined ? opts : { agent: model });
	}

	/** The model a run asks, or undefined for an `--exec` command, which is a
	 * model nothing here can name or price. */
	private model(config: Config, opts: AgentOptions): string | undefined {
		return opts.exec === undefined ? (opts.agent ?? config.agent) : undefined;
	}

	private config(
		path: string,
	): Promise<{ config: Config; diagnostics: ConfigDiagnostic[] }> {
		return new Configs(this.loader).load(path);
	}

	/** The config, for a command that has no business running without it: one
	 * that will not compile prints its diagnostics and exits. */
	private async sound(path: string): Promise<Config> {
		const { config, diagnostics } = await this.config(path);
		if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
			this.report(config.rules.length, diagnostics, false);
		}
		return config;
	}

	private report(
		rules: number,
		diagnostics: ConfigDiagnostic[],
		strict: boolean,
	): void {
		const rows = diagnostics.map((diagnostic) => [
			diagnostic.line === undefined
				? diagnostic.rule
				: `${diagnostic.rule}:${diagnostic.line}`,
			diagnostic.severity,
			diagnostic.message,
		]);
		for (const line of table(rows)) {
			this.log.info(line);
		}
		const errors = diagnostics.filter(
			(diagnostic) => diagnostic.severity === "error",
		).length;
		const summary = `${count(errors, "error")}, ${count(diagnostics.length - errors, "warning")}`;
		if (errors > 0 || (strict && diagnostics.length > errors)) {
			throw new Error(summary);
		}
		this.log.info(`sound: ${count(rules, "rule")}, ${summary}`);
	}
}
