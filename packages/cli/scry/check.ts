import {
	BatchedDecider,
	CachedDecider,
	type DeciderUsage,
	Decisions,
	Git,
	type Report,
	Rules,
} from "@webappwiz/scry";
import { ConsoleLogger, color, type Logger } from "webappwiz/log";
import { type Fs, type Glob, NodeFs, NodePs, type Ps } from "webappwiz/system";
import { ProjectCredentials } from "../credentials/project-credentials";
import { loadConfig } from "../load-config";
import { table } from "../table";
import { HostedProviders, OnDemandJudge, type Providers } from "./providers";

/** Where a project keeps the answers its decider was given, between runs. */
export const DECISIONS = "node_modules/.cache/webappwiz/scry/decisions.json";

export interface CheckOptions {
	/**
	 * Where to look, from the working directory: only changed files at or
	 * under these are checked. None checks the whole change. The project
	 * root, holding `.wiz/scry`, is the root of the git repository.
	 */
	paths: string[];
	/** The ref the change is measured from; see `Git.changes` for the default. */
	since?: string;
	/** How many requests to the model are out at once, over the config's `jobs`. */
	jobs?: number;
	/** The model a rule's decider asks, over the config's `model`. */
	model?: string;
	/** `json` for the report as JSON; anything else is text. */
	format: string;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	glob?: Glob;
	/** What makes the judge for a model; Workers AI and TypeSafe by default. */
	providers?: Providers;
}

/** What the decider spent, beside the report. */
interface Spent extends DeciderUsage {
	/** Questions answered from what was kept from an earlier run. */
	cached: number;
}

/**
 * Checks a change against the project's rules, the way a linter checks code:
 * one block of problems, and a nonzero exit when any is an error. It exits 1
 * on an error, 2 when a rule went unchecked on a file, 0 otherwise.
 *
 * Each rule's `rule.ts` reads the changed files it applies to. Where code
 * cannot settle a question it asks a decision model, which answers with how
 * likely a yes is and writes nothing: the report is for whoever fixes the
 * code, person or agent, to act on.
 */
export async function check(opts: CheckOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();
	const { root: dir, paths } = await Git.locate(ps.cwd(), opts.paths, { ps });
	const rules = await Rules.load(dir, { fs });
	if (rules.all.length === 0) {
		log.error(`no rules in ${dir}/.wiz/scry: add one with \`wiz scry add\``);
		return;
	}
	const settings = await loadConfig(dir, { fs, ps });
	const changes = await new Git(dir, { ps }).changes(opts.since, paths);
	if (changes.files.length === 0) {
		log.error(
			`nothing changed since ${changes.since}${paths.length === 0 ? "" : ` in ${opts.paths.join(", ")}`}`,
		);
		return;
	}

	// the first ctrl-c stops the check and reports what came back; one after
	// that, or once it is done, quits as usual
	const cancel = new AbortController();
	let running = true;
	ps.on("SIGINT", () => {
		if (running && !cancel.signal.aborted) {
			cancel.abort();
		} else {
			ps.exit(130);
		}
	});

	const model = opts.model ?? settings.model;
	const providers =
		opts.providers ??
		new HostedProviders(
			(await ProjectCredentials.open(dir, { fs, ps })).credentials,
		);
	const batched = new BatchedDecider(new OnDemandJudge(providers, model), {
		jobs: opts.jobs ?? settings.jobs,
		signal: cancel.signal,
	});
	const decisions = await Decisions.open(`${dir}/${DECISIONS}`, { fs });
	const decider = new CachedDecider(batched, decisions, model);
	const report = await rules
		.check({
			paths: changes.files.map((file) => file.path),
			tools: { decider },
			glob: opts.glob,
			signal: cancel.signal,
		})
		.finally(() => {
			running = false;
		});
	await decisions.save();
	const spent: Spent = { ...batched.usage, cached: decider.hits };

	if (report.legacy.length > 0) {
		log.error(
			`${report.legacy.length} ${plural(report.legacy.length, "file")} still ${report.legacy.length === 1 ? "uses" : "use"} rule-ignore, which scry honors for now: rename it to scry-ignore`,
		);
	}
	log.info(
		opts.format === "json"
			? JSON.stringify({ since: changes.since, ...report, spent }, null, 2)
			: text(report, changes.since, spent).join("\n"),
	);
	if (report.problems.some((problem) => problem.level === "error")) {
		ps.exit(1);
	} else if (report.unchecked.length > 0) {
		ps.exit(2);
	}
}

/** The report as a linter prints one: problems under each file, then a tally. */
function text(report: Report, since: string, spent: Spent): string[] {
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
	if (report.withoutCheck.length > 0) {
		lines.push(
			color.dim(
				`  ${report.withoutCheck.length} ${plural(report.withoutCheck.length, "rule")} with no rule.ts yet checked nothing: ${report.withoutCheck.join(", ")}`,
			),
		);
	}
	if (spent.questions + spent.cached > 0) {
		lines.push(color.dim(asked(spent)));
	}
	return lines;
}

/**
 * The last line: what was found, where, and what the check could not vouch
 * for. It never says `no problems` of files it did not check.
 */
function tally(report: Report, since: string): string {
	const errors = report.problems.filter(
		(problem) => problem.level === "error",
	).length;
	const warnings = report.problems.length - errors;
	const scope = `${report.files} ${plural(report.files, "file")} since ${since}`;
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

/** What the decider asked, and what it cost. */
function asked(spent: Spent): string {
	const cached =
		spent.cached === 0 ? "" : `, ${spent.cached} answered from earlier runs`;
	const tokens =
		spent.input === 0 ? "" : `, ${thousands(spent.input)} input tokens`;
	return `  asked ${spent.questions} ${plural(spent.questions, "question")} in ${spent.requests} ${plural(spent.requests, "request")}${cached}${tokens}`;
}

function plural(count: number, noun: string): string {
	return count === 1 ? noun : `${noun}s`;
}

function thousands(tokens: number): string {
	if (tokens < 1000) {
		return String(tokens);
	}
	// a decimal while it still tells two numbers apart: 6.5k cached of 7k
	return tokens < 10_000
		? `${Number((tokens / 1000).toFixed(1))}k`
		: `${Math.round(tokens / 1000)}k`;
}
