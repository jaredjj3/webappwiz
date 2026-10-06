import { Git, Progress, type Report, Rules } from "@webappwiz/scry";
import { ConsoleLogger, color, type Logger } from "webappwiz/log";
import {
	type Fs,
	type Glob,
	NodeFs,
	NodeGlob,
	NodePs,
	type Ps,
} from "webappwiz/system";
import { SystemTimer, type Timer, type WallClock } from "webappwiz/time";
import type { Effort, Role } from "../config";
import { chooseModels, loadConfig } from "../load-config";
import { table } from "../table";
import type { Allowance } from "./budgets";
import { NONE_DECLARED, OVER_BUDGET, ProjectBudgets } from "./project-budgets";
import {
	asked,
	ProjectTools,
	plural,
	type Spent,
	wouldAsk,
} from "./project-tools";
import type { Providers } from "./providers";
import type { Screen } from "./screen";
import { Spinner } from "./spinner";

export interface CheckOptions {
	/**
	 * Where to look, from the working directory: every file at or under
	 * these is checked, changed or not; none is the working directory. The
	 * project root, holding `.wiz/scry`, is the root of the git repository.
	 */
	paths: string[];
	/**
	 * Checks only the files under `paths` changed since this ref, committed
	 * or not.
	 */
	since?: string;
	/** Checks with only the rules these ids name; every rule when empty. */
	rules?: string[];
	/** How many requests to the model are out at once, over the config's `jobs`. */
	jobs?: number;
	/** Which of the config's `models` to ask, over the config's `effort`. */
	effort?: Effort;
	/** The model a rule's `decider` asks, over the effort's. */
	model?: string;
	/** The model a rule's `llm` asks, over the effort's. */
	llm?: string;
	/** `json` for the report as JSON; anything else is text. */
	format: string;
	/**
	 * Says what the check would cost instead of running it: every question it
	 * would ask, counted rather than sent, and no report. False by default.
	 */
	cost?: boolean;
	/**
	 * Checks whatever `scry.budgets` says, spending without a limit, and
	 * without one declared. False by default.
	 */
	overrideBudget?: boolean;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	glob?: Glob;
	/** What makes the judge for a model; Workers AI, TypeSafe and Anthropic by default. */
	providers?: Providers;
	/**
	 * Where a line of progress is drawn while the check runs, when it is
	 * live and the report is text. None draws nothing.
	 */
	screen?: Screen;
	/** What ticks that line. */
	timer?: Timer;
	/** When spending happens, for the budgets' windows. */
	clock?: WallClock;
}

/**
 * Checks every file under some paths, or only the ones a change touched,
 * against the project's rules, the way a linter checks code:
 * one block of problems, and a nonzero exit when any is an error. It exits 1
 * on an error, 2 when a rule went unchecked on a file, 3 when it would
 * spend more than `scry.budgets` allows or none is declared, 0 otherwise.
 *
 * With a number to stay under, it counts what it would ask first, as
 * `cost` does, and refuses to run when that would go over. A question it
 * would still have to ask past a budget goes unasked, and unchecked.
 *
 * Each rule's `rule.ts` reads the files it applies to. Where code
 * cannot settle a question it asks a decision model, which answers with how
 * likely a yes is and writes nothing: the report is for whoever fixes the
 * code, person or agent, to act on.
 */
export async function check(opts: CheckOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();
	// no paths is the working directory, as for any linter
	const { root: dir, paths } = await Git.locate(
		ps.cwd(),
		opts.paths.length === 0 ? ["."] : opts.paths,
		{ ps },
	);
	const rules = await Rules.load(dir, { fs });
	if (rules.all.length === 0) {
		log.error(`no rules in ${dir}/.wiz/scry: add one with \`wiz scry add\``);
		return;
	}
	const settings = await loadConfig(dir, { fs, ps });
	const glob = opts.glob ?? new NodeGlob();
	const git = new Git(dir, { ps });
	// every file under the paths, or only the ones changed since a ref
	const changes =
		opts.since === undefined ? undefined : await git.changes(opts.since, paths);
	const since = changes?.since;
	const found =
		changes?.files.map((file) => file.path) ?? (await git.files(paths));
	// what the config excludes, like code copied in from elsewhere, is not
	// the project's to fix
	const files = found.filter(
		(path) => !settings.exclude.some((pattern) => glob.matches(pattern, path)),
	);
	if (files.length === 0) {
		const where = opts.paths.length === 0 ? "" : ` in ${opts.paths.join(", ")}`;
		log.error(
			since === undefined
				? `no files to check${where}`
				: `nothing changed since ${since}${where}`,
		);
		return;
	}

	const budgets = await ProjectBudgets.open(dir, settings, {
		override: opts.overrideBudget,
		clock: opts.clock,
		fs,
		ps,
	});
	if (budgets.undeclared && !opts.cost) {
		log.error(NONE_DECLARED);
		ps.exit(OVER_BUDGET);
		return;
	}

	// the first ctrl-c stops the check and reports what came back; one after
	// that, or once it is done, quits as usual
	const cancel = new AbortController();
	let running = false;
	let spinner: Spinner | undefined;
	ps.on("SIGINT", () => {
		if (running && !cancel.signal.aborted) {
			cancel.abort();
		} else {
			spinner?.dispose();
			ps.exit(130);
		}
	});

	/** Runs the rules, counting what they ask or asking it. */
	const pass = async (
		counting: boolean,
		allowances?: Partial<Record<Role, Allowance>>,
	) => {
		const asking = await ProjectTools.open(dir, {
			models: chooseModels(settings, opts),
			jobs: opts.jobs ?? settings.jobs,
			signal: cancel.signal,
			providers: opts.providers,
			counting,
			budgets: allowances,
			fs,
			ps,
		});
		const progress = new Progress();
		if (opts.screen !== undefined && opts.format !== "json") {
			spinner = new Spinner({
				screen: opts.screen,
				timer: opts.timer ?? new SystemTimer(),
				progress,
				asking,
				verb: counting ? "counting" : "checking",
				noun: "file",
			});
		}
		running = true;
		spinner?.start();
		const report = await rules
			.check({
				paths: files,
				ids: opts.rules,
				tools: asking.tools,
				glob,
				signal: cancel.signal,
				progress,
			})
			.finally(() => {
				running = false;
				spinner?.dispose();
			});
		await asking.save();
		return { asking, report };
	};

	if (opts.cost) {
		const { asking, report } = await pass(true);
		const spent = asking.spent;
		const use = (role: Role) => asking.input(role);
		log.info(
			opts.format === "json"
				? JSON.stringify(
						{
							since,
							files: report.files,
							unchecked: report.unchecked,
							cancelled: report.cancelled,
							spent,
							...budgets.json(use),
						},
						null,
						2,
					)
				: [...costed(report, spent), ...budgets.lines(use)].join("\n"),
		);
		if (report.cancelled || report.unchecked.length > 0) {
			ps.exit(2);
		}
		return;
	}

	if (budgets.countsFirst) {
		// counted answers are never kept, so the check below still asks
		const { asking: counted, report } = await pass(true);
		if (report.cancelled) {
			ps.exit(130);
			return;
		}
		const overrun = budgets.overrun((role) => counted.input(role), "check");
		if (overrun !== undefined) {
			log.error(overrun);
			ps.exit(OVER_BUDGET);
			return;
		}
	}

	const { asking, report } = await pass(false, budgets.allowances);
	await budgets.record(asking);
	const spent = asking.spent;

	if (report.legacy.length > 0) {
		log.error(
			[
				`${report.legacy.length} ${plural(report.legacy.length, "file")} still ${report.legacy.length === 1 ? "uses" : "use"} rule-ignore, which scry honors for now: rename it to scry-ignore`,
				...report.legacy.map((path) => `  ${path}`),
			].join("\n"),
		);
	}
	log.info(
		opts.format === "json"
			? JSON.stringify({ since, ...report, spent }, null, 2)
			: text(report, since, spent).join("\n"),
	);
	if (report.problems.some((problem) => problem.level === "error")) {
		ps.exit(1);
	} else if (report.unchecked.length > 0) {
		ps.exit(2);
	}
}

/** The report as a linter prints one: problems under each file, then a tally. */
function text(
	report: Report,
	since: string | undefined,
	spent: Spent,
): string[] {
	const rows = report.problems.map((problem) => [
		`  ${color.dim(String(problem.line))}`,
		problem.level === "error"
			? color.red(problem.level)
			: color.yellow(problem.level),
		color.dim(`${Math.round(problem.confidence * 100)}%`),
		problem.message,
		color.dim(problem.rule),
	]);
	const aligned = table(rows);
	const lines: string[] = [];
	for (const [index, problem] of report.problems.entries()) {
		if (report.problems[index - 1]?.path !== problem.path) {
			lines.push(...(index === 0 ? [] : [""]), color.bold(problem.path));
		}
		lines.push(aligned[index] ?? "");
	}
	if (report.unchecked.length > 0) {
		lines.push(
			...(lines.length === 0 ? [] : [""]),
			color.bold("not checked"),
			...table(
				report.unchecked.map((item) => [`  ${item.subject}`, item.reason]),
			),
		);
	}
	lines.push(...(lines.length === 0 ? [] : [""]), tally(report, since));
	if (spent.questions + spent.cached > 0) {
		lines.push(color.dim(asked(spent)));
	}
	return lines;
}

/** What a check would cost, then what it could not count. */
function costed(report: Report, spent: Spent): string[] {
	const missed = report.unchecked.length;
	const stopped = report.cancelled ? "cancelled: " : "";
	const but = missed === 0 ? "" : `, but ${missed} not counted`;
	const line = `${stopped}${wouldAsk(spent, report.files)}${but}`;
	return missed === 0
		? [report.cancelled ? color.yellow(line) : line]
		: [
				color.bold("not counted"),
				...table(
					report.unchecked.map((item) => [`  ${item.subject}`, item.reason]),
				),
				"",
				color.yellow(line),
			];
}

/**
 * The last line: what was found, where, and what the check could not vouch
 * for. It never says `no problems` of files it did not check. `since` is
 * what a change was measured from; a check of whole paths has none.
 */
function tally(report: Report, since: string | undefined): string {
	const errors = report.problems.filter(
		(problem) => problem.level === "error",
	).length;
	const warnings = report.problems.length - errors;
	const scope = `${report.files} ${plural(report.files, "file")}${since === undefined ? "" : ` since ${since}`}`;
	const missed = report.unchecked.length;
	const stopped = report.cancelled ? "cancelled: " : "";
	const but = missed === 0 ? "" : `, but ${missed} not checked`;
	if (report.problems.length > 0) {
		return (errors > 0 ? color.red : color.yellow)(
			`✖ ${stopped}${report.problems.length} ${plural(report.problems.length, "problem")} (${errors} ${plural(errors, "error")}, ${warnings} ${plural(warnings, "warning")}) in ${scope}${but}`,
		);
	}
	return missed === 0 && !report.cancelled
		? color.green(`✔ no problems in ${scope}`)
		: color.yellow(`⚠ ${stopped}no problems found in ${scope}${but}`);
}
