import {
	AGENTS,
	Analyzer,
	agentCommand,
	type GuideDiagnostic,
	type GuideLoader,
	loadGuide,
	loadProjectGuide,
	Mechanizer,
	type Rule,
	type Task,
} from "@webappwiz/lint";
import type { Logger } from "@webappwiz/log";
import type { Fs, Ps } from "@webappwiz/sys";
import type { Clock } from "@webappwiz/time";
import { changed } from "./changed";
import {
	count,
	finished,
	overBudget,
	planned,
	summary,
	tokens,
} from "./report";
import { table } from "./table";

/** Asked before a run spends more than it was allowed to. */
export type Confirm = (question: string) => boolean | Promise<boolean>;

/** What a whole plan reads: every task's prompt and the files it names. */
const estimated = (tasks: Task[]): number =>
	tokens(tasks.reduce((n, t) => n + t.bytes, 0));

/**
 * Answers on the terminal, and answers no without one: a run nobody is watching
 * should stop and say the number rather than block forever waiting to be told
 * to go ahead.
 */
export const ask: Confirm = (question) =>
	process.stdin.isTTY === true &&
	/^y(es)?$/i.test((prompt(`${question} [y/N]`) ?? "").trim());

export class LintCommands {
	constructor(
		private log: Logger,
		private fs: Fs,
		private ps: Ps,
		private clock: Clock,
		private loader?: GuideLoader,
		private confirm: Confirm = ask,
	) {}

	/**
	 * Everything wrong with the guide itself: compile diagnostics, and a warning
	 * for each rule an agent says a linter, formatter, type checker or grep
	 * could enforce instead. Exits 1 on errors, and on warnings only under
	 * `strict`: moving a rule out of the guide is a decision to make once, not a
	 * build failure by surprise.
	 *
	 * Under `sound` it stops after the compile diagnostics, spawning nothing,
	 * which is the check worth running on every commit: it costs nothing, and
	 * which rules a tool could take over does not change between them.
	 */
	async audit(opts: {
		rules: string;
		strict: boolean;
		sound?: boolean;
		agent?: string;
		exec?: string;
	}): Promise<void> {
		if (opts.sound && (opts.agent !== undefined || opts.exec !== undefined)) {
			// Both say what the run is, and --sound is already saying it runs no
			// agent. Letting one quietly win would leave a caller unsure which of
			// the two things they asked for they got.
			throw new Error(
				"--sound checks the guide compiles and runs no agent, so it takes " +
					"no --agent or --exec",
			);
		}
		if (!opts.sound && opts.agent === undefined && opts.exec === undefined) {
			throw new Error(
				"audit asks an agent, so name one: --agent " +
					`<${Object.keys(AGENTS).join("|")}> or --exec <command>`,
			);
		}
		const { rules, diagnostics } = await this.guide(opts.rules);
		if (opts.sound) {
			this.report(rules.length, diagnostics, opts.strict);
			return;
		}
		if (diagnostics.some((d) => d.severity === "error")) {
			// Before any agent runs: a guide that will not compile is not worth
			// spending calls on, and the errors are the more urgent report.
			this.report(rules.length, diagnostics, opts.strict);
		}
		const mechanizer = new Mechanizer(this.log, this.ps);
		// Rules carrying a check are already mechanized: only the agent-judged
		// ones are worth asking about.
		diagnostics.push(
			...(await mechanizer.check(
				rules.filter((r) => !r.check),
				agentCommand(opts),
			)),
		);
		this.report(rules.length, diagnostics, opts.strict);
	}

	/** Lists a guide's rules, one row each, ids first for citing. */
	async ls(opts: { rules: string }): Promise<void> {
		const { rules } = await this.sound(opts.rules);
		const rows = [
			["ID", "RULE", "LEVEL", "FILES", "CHECK", "GOOD", "BAD", "PATH"],
		];
		for (const r of rules) {
			rows.push([
				r.id,
				r.name,
				r.level,
				r.files,
				// which rules cost tokens: a checked rule is the linter's, free
				r.check ? (r.partial ? "partial" : "full") : "",
				String(r.good.length),
				String(r.bad.length),
				r.path,
			]);
		}
		this.log.info(table(rows).join("\n"));
	}

	/**
	 * Prints one rule in full: what it covers, and the document an analysis
	 * agent is given, verbatim. Take the id from `lint ls` or from a finding.
	 */
	async show(opts: { id: string; rules: string }): Promise<void> {
		const { rules } = await this.sound(opts.rules);
		const rule = rules.find((r) => r.id === opts.id);
		if (!rule) {
			throw new Error(
				`no rule "${opts.id}" in ${opts.rules}. Known ids: ${rules.map((r) => r.id).join(", ")}`,
			);
		}
		this.log.info(
			table([
				["ID", rule.id],
				["RULE", rule.name],
				["LEVEL", rule.level],
				["FILES", rule.files],
				["PATH", rule.path],
			]).join("\n"),
		);
		this.log.info("");
		this.log.info(rule.text.trim());
	}

	/**
	 * Runs the guide over a directory with the agent you name, as `agent` or
	 * `exec`; there is no default. Exits 1 on any error. Under `prompt` it
	 * spawns nothing and prints the prompts instead, for an agent that would
	 * rather hand them to subagents of its own.
	 *
	 * `since` narrows the run to what git says has changed, and `budget` caps
	 * what it may read before asking whether you meant it. Under `estimate` it
	 * prints that size and stops, which is the answer to "what would this cost"
	 * without having to guess a budget low enough to be refused.
	 */
	async analyze(opts: {
		rules: string;
		dir: string;
		agent?: string;
		exec?: string;
		prompt?: boolean;
		estimate?: boolean;
		chunk: number;
		since?: string;
		budget: number;
	}): Promise<void> {
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
		const { rules: all } = await this.sound(opts.rules);
		// A rule with a full check is the linter's, already enforced for free;
		// an agent reads only the rules, or the parts of them, no check decides.
		const rules = all.filter((r) => !r.check || r.partial);
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
		const analyzer = new Analyzer(this.log, this.fs, this.ps, this.clock);
		if (opts.prompt) {
			for (const task of await analyzer.plan(rules, dir, opts.chunk, only)) {
				this.log.info(
					`=== ${task.rule.id} ${task.rule.name} (${count(task.files.length, "file")}) ===`,
				);
				this.log.info(task.prompt);
			}
			return;
		}
		if (opts.estimate) {
			const tasks = await analyzer.plan(rules, dir, opts.chunk, only);
			const files = new Set(tasks.flatMap((t) => t.files)).size;
			// No budget check: being asked to approve a number is what running
			// --estimate is instead of.
			this.log.info(
				planned(files, rules.length, tasks.length, estimated(tasks)),
			);
			return;
		}
		const agent = agentCommand(opts);
		const started = this.clock.now();
		const violations = await analyzer.analyze(
			rules,
			dir,
			opts.chunk,
			agent,
			{
				planned: async (tasks) => {
					const files = new Set(tasks.flatMap((t) => t.files)).size;
					const estimate = estimated(tasks);
					this.log.info(
						planned(files, rules.length, tasks.length, estimate, agent.label),
					);
					if (estimate > opts.budget) {
						this.log.info(overBudget(estimate, opts.budget));
						if (!(await this.confirm("Run anyway?"))) {
							// Throwing here is what cancels: analyze has spawned nothing yet.
							throw new Error("over budget");
						}
					}
				},
				finished: (task) => {
					for (const line of finished(task)) {
						this.log.info(line);
					}
				},
			},
			only,
		);
		this.log.info("");
		this.log.info(summary(violations, this.clock.now().subtract(started)));
		const errors = violations.filter((v) => v.level === "error").length;
		if (errors > 0) {
			throw new Error(count(errors, "lint error"));
		}
	}

	private guide(
		path: string,
	): Promise<{ rules: Rule[]; diagnostics: GuideDiagnostic[] }> {
		// An injected loader is its own module system, so the missing-config
		// fallback to the recommended rules is only for real runs.
		return this.loader
			? loadGuide(this.fs, path, this.loader)
			: loadProjectGuide(this.fs, path);
	}

	/** The guide's rules, for a command that has no business running without
	 * them: a guide that will not compile prints its diagnostics and exits. */
	private async sound(path: string): Promise<{ rules: Rule[] }> {
		const { rules, diagnostics } = await this.guide(path);
		if (diagnostics.some((d) => d.severity === "error")) {
			this.report(rules.length, diagnostics, false);
		}
		return { rules };
	}

	private report(
		rules: number,
		diagnostics: GuideDiagnostic[],
		strict: boolean,
	): void {
		const rows = diagnostics.map((d) => [
			d.line === undefined ? d.path : `${d.path}:${d.line}`,
			d.severity,
			d.message,
		]);
		for (const line of table(rows)) {
			this.log.info(line);
		}
		const errors = diagnostics.filter((d) => d.severity === "error").length;
		const summary = `${count(errors, "error")}, ${count(diagnostics.length - errors, "warning")}`;
		if (errors > 0 || (strict && diagnostics.length > errors)) {
			throw new Error(summary);
		}
		this.log.info(`sound: ${count(rules, "rule")}, ${summary}`);
	}
}
