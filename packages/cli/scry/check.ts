import {
	Check,
	type Effort,
	Git,
	type Judge,
	type Report,
	Rules,
} from "@webappwiz/scry";
import { ConsoleLogger, color, type Logger } from "webappwiz/log";
import { type Fs, type Glob, NodeFs, NodePs, type Ps } from "webappwiz/system";
import {
	type Clock,
	SystemClock,
	SystemTimer,
	type Timer,
} from "webappwiz/time";
import { ProjectCredentials } from "../credentials/project-credentials";
import { loadConfig } from "../load-config";
import { table } from "../table";
import { Progress } from "./progress";
import { HostedProviders, type Providers } from "./providers";
import { type Screen, StderrScreen } from "./screen";

export interface CheckOptions {
	/**
	 * Where to look, from the working directory: only changed files at or
	 * under these are checked. None checks the whole change. The project
	 * root, holding `.wiz/scry`, is the root of the git repository.
	 */
	paths: string[];
	/** The ref the change is measured from; see `Git.changes` for the default. */
	since?: string;
	/** How many calls run at once, over the config's `jobs`. */
	jobs?: number;
	/**
	 * The model every rule is judged by, over the config's `models`, so two
	 * models can be compared on one change.
	 */
	model?: string;
	/** `json` for the report as JSON; anything else is text. */
	format: string;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	glob?: Glob;
	/** Where progress is drawn while the calls run; stderr by default. */
	screen?: Screen;
	/** What progress times the calls by. */
	clock?: Clock;
	/** What ticks progress over. */
	timer?: Timer;
	/** What makes the judge for a model; Workers AI and TypeSafe by default. */
	providers?: Providers;
}

/**
 * Checks a change against the project's rules, the way a linter checks code:
 * one block of findings, and a nonzero exit when any is an error. It exits 1
 * on an error finding, 2 when a file or script went unchecked, 0 otherwise.
 *
 * A decision model judges each rule, saying how likely the change is to
 * break it, and no model writes anything: the report is for whoever fixes
 * the code, person or agent, to act on.
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
	const prepared = await Check.prepare({
		dir,
		rules,
		changes,
		fs,
		ps,
		glob: opts.glob,
	});

	const providers =
		opts.providers ??
		new HostedProviders(
			(await ProjectCredentials.open(dir, { fs, ps })).credentials,
		);
	const judges = new Map<Effort, Judge>();
	for (const effort of prepared.efforts) {
		if (effort !== "none") {
			judges.set(
				effort,
				await providers.judge(opts.model ?? settings.models[effort]),
			);
		}
	}

	// progress goes to stderr, so the report on stdout stays one clean block
	const jobs = opts.jobs ?? settings.jobs;
	const total = prepared.calls.length;
	const progress = new Progress(prepared, {
		screen: opts.screen ?? new StderrScreen(),
		log,
		clock: opts.clock ?? new SystemClock(),
		timer: opts.timer ?? new SystemTimer(),
	});
	if (total > 0) {
		progress.start(
			`sending ${total} ${plural(total, "call")} (~${thousands(prepared.tokens)} input tokens), ${Math.min(jobs, total)} at a time`,
		);
	}
	// the first ctrl-c stops the check and reports what came back; one after
	// that, or once the calls are done, quits as usual
	const cancel = new AbortController();
	let running = true;
	ps.on("SIGINT", () => {
		if (running && !cancel.signal.aborted) {
			cancel.abort();
		} else {
			ps.exit(130);
		}
	});
	const report = await prepared
		.run({ judges, jobs, signal: cancel.signal })
		.finally(() => {
			running = false;
			progress.dispose();
		});
	if (report.legacy.length > 0) {
		log.error(
			`${report.legacy.length} ${plural(report.legacy.length, "file")} still ${report.legacy.length === 1 ? "uses" : "use"} rule-ignore, which scry honors for now: rename it to scry-ignore`,
		);
	}
	log.info(
		opts.format === "json"
			? JSON.stringify(report, null, 2)
			: text(report).join("\n"),
	);
	if (report.findings.some((finding) => finding.level === "error")) {
		ps.exit(1);
	} else if (report.unchecked.length > 0) {
		ps.exit(2);
	}
}

/** The report as a linter prints one: findings under each file, then a tally. */
function text(report: Report): string[] {
	const rows = report.findings.map((finding) => [
		`  ${color.dim(String(finding.line))}`,
		finding.level === "error"
			? color.red(finding.level)
			: color.yellow(finding.level),
		color.dim(`${Math.round(finding.probability * 100)}%`),
		finding.message,
		color.dim(finding.rule),
	]);
	const aligned = table(rows);
	const lines: string[] = [];
	for (const [index, finding] of report.findings.entries()) {
		if (report.findings[index - 1]?.file !== finding.file) {
			lines.push(...(index === 0 ? [] : [""]), color.bold(finding.file));
		}
		lines.push(aligned[index] ?? "");
	}
	if (report.unchecked.length > 0) {
		const unchecked = table(
			report.unchecked.map((item) => [`  ${item.subject}`, item.reason]),
		);
		lines.push(
			...(lines.length === 0 ? [] : [""]),
			color.bold("not checked"),
			...unchecked,
		);
	}
	lines.push(...(lines.length === 0 ? [] : [""]), tally(report));
	if (report.usage) {
		lines.push(color.dim(spent(report.usage)));
	}
	return lines;
}

/**
 * The last line: what was found, where, and what the check could not vouch
 * for. It never says `no problems` of files it did not check.
 */
function tally(report: Report): string {
	const errors = report.findings.filter(
		(finding) => finding.level === "error",
	).length;
	const warnings = report.findings.length - errors;
	const scope = `${report.files} ${plural(report.files, "file")} since ${report.since}`;
	const missed = new Set(report.unchecked.map((item) => item.subject)).size;
	const stopped = report.cancelled ? "cancelled: " : "";
	const but = missed === 0 ? "" : `, but ${missed} not checked`;
	if (report.findings.length > 0) {
		return (errors > 0 ? color.red : color.yellow)(
			`✖ ${stopped}${report.findings.length} ${plural(report.findings.length, "problem")} (${errors} ${plural(errors, "error")}, ${warnings} ${plural(warnings, "warning")}) in ${scope}${but}`,
		);
	}
	return missed === 0
		? color.green(`✔ no problems in ${scope}`)
		: color.yellow(`⚠ ${stopped}no problems found in ${scope}${but}`);
}

/** What the judges that report usage really spent. */
function spent(usage: NonNullable<Report["usage"]>): string {
	return `  spent ${thousands(usage.input)} input tokens across ${usage.calls} ${plural(usage.calls, "call")}`;
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
