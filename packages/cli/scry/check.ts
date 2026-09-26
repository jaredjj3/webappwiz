import {
	type Agent,
	Check,
	type Effort,
	Git,
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
import { loadConfig } from "../load-config";
import { table } from "../table";
import { CommandAgent } from "./agent";
import { Progress } from "./progress";
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
	/** How many agent calls run at once, over the config's `jobs`. */
	jobs?: number;
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
	// scry-ignore objects-over-callbacks: the platform's own prompt() is the
	// dependency here, and it is a bare function
	prompt?: (message: string) => string | null;
}

const SAMPLE = `export default {
	scry: {
		agents: {
			medium: 'claude -p --model sonnet --tools ""',
		},
	},
};`;

/**
 * Checks a change against the project's rules, the way a linter checks code:
 * one block of findings, and a nonzero exit when any is an error. It exits 1
 * on an error finding, 2 when a file or script went unchecked or the check
 * did not run, 0 otherwise.
 *
 * Everything that costs nothing happens first: finding the change, matching
 * rules, running their scripts. When the prompts left to send come to more
 * input tokens than the budget, it asks before sending any. The answer is
 * read from stdin, so an agent relays a person's answer by piping it in.
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
		batch: settings.batch,
		fs,
		ps,
		glob: opts.glob,
	});

	const agents = new Map<Effort, Agent>();
	for (const effort of prepared.efforts) {
		if (effort === "none") {
			continue;
		}
		const own = settings.agents[effort];
		const agent = own ?? settings.agents.medium;
		if (agent === undefined) {
			throw new Error(
				`no agent for effort medium: put one in .wiz/config.ts, ~/.config/wiz/config.ts, or WIZ_SCRY_AGENT_MEDIUM, as in\n\n${SAMPLE}`,
			);
		}
		if (own === undefined) {
			log.error(`no agent for effort ${effort}: using medium's`);
		}
		agents.set(effort, new CommandAgent(agent, { dir, ps }));
	}

	if (prepared.tokens > settings.budget) {
		const question = `~${thousands(prepared.tokens)} input tokens across ${prepared.calls.length} calls (budget ${thousands(settings.budget)}). Proceed? [y/N]`;
		const answer = (opts.prompt ?? prompt)(question);
		if (answer === null) {
			// prompt() has already printed the question
			log.error(
				"no answer on stdin: ask, then rerun with the answer piped in, as in `echo y | wiz scry`",
			);
			ps.exit(2);
			return;
		}
		if (!/^y(es)?$/i.test(answer.trim())) {
			log.error("not run");
			ps.exit(2);
			return;
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
		.run({ agents, jobs, signal: cancel.signal })
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

/** What the agents that report usage really spent. */
function spent(usage: NonNullable<Report["usage"]>): string {
	const cost = usage.cost === undefined ? "" : `, $${usage.cost.toFixed(2)}`;
	return `  spent ${thousands(usage.input)} input tokens (${thousands(usage.cached)} cached) and ${thousands(usage.output)} output${cost}, across ${usage.calls} ${plural(usage.calls, "call")}`;
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
