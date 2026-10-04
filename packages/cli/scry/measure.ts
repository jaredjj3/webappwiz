import { Git, type Measurement, Rules, type Scored } from "@webappwiz/scry";
import { ConsoleLogger, color, type Logger } from "webappwiz/log";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import { loadConfig } from "../load-config";
import { table } from "../table";
import { asked, ProjectDecider, plural } from "./project-decider";
import type { Providers } from "./providers";

export interface MeasureOptions {
	/** Rule ids; every rule when empty. */
	ids: string[];
	/** How many requests to the model are out at once, over the config's `jobs`. */
	jobs?: number;
	/** The model a rule's decider asks, over the config's `model`. */
	model?: string;
	/** `json` for the scores as JSON; anything else is text. */
	format: string;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	providers?: Providers;
}

/**
 * Scores each rule on its labeled cases, the way `wiz scry` would run it: a
 * bad case is right when the rule reports something in it, a good one when
 * it reports nothing. Names every case it got wrong, and what that cost.
 */
export async function measure(opts: MeasureOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();
	const { root: dir } = await Git.locate(ps.cwd(), [], { ps });
	const rules = await Rules.load(dir, { fs });
	const settings = await loadConfig(dir, { fs, ps });
	const decider = await ProjectDecider.open(dir, {
		model: opts.model ?? settings.model,
		jobs: opts.jobs ?? settings.jobs,
		providers: opts.providers,
		fs,
		ps,
	});
	const measured = await rules.measure({ ids: opts.ids, tools: { decider } });
	await decider.save();
	if (opts.format === "json") {
		log.info(
			JSON.stringify({ rules: measured, spent: decider.spent }, null, 2),
		);
		return;
	}
	log.info(text(measured).join("\n"));
	if (decider.spent.questions + decider.spent.cached > 0) {
		log.info(color.dim(asked(decider.spent)));
	}
}

/** Whether the rule got the case right. */
function right(scored: Scored): boolean {
	return (
		scored.error === undefined &&
		(scored.kind === "bad") === scored.findings.length > 0
	);
}

/** A score per rule, then each case a rule got wrong, then the total. */
function text(measured: Measurement[]): string[] {
	const checked = measured.filter(
		(measurement) => measurement.cases.length > 0,
	);
	const rows = checked.map((measurement) => {
		const { cases } = measurement;
		const wrong = cases.filter((scored) => !right(scored));
		const missed = wrong.filter((scored) => scored.kind === "bad").length;
		return [
			measurement.rule,
			`${cases.length - wrong.length}/${cases.length}`,
			missed === 0 ? "-" : String(missed),
			wrong.length - missed === 0 ? "-" : String(wrong.length - missed),
		];
	});
	const lines = table([
		["rule", "right", "missed", "false alarms"].map(color.dim),
		...rows,
	]);
	const wrong = checked.flatMap((measurement) =>
		measurement.cases
			.filter((scored) => !right(scored))
			.map((scored) => [`  ${measurement.rule}`, scored.name, why(scored)]),
	);
	if (wrong.length > 0) {
		lines.push("", color.bold("wrong"), ...table(wrong));
	}
	const total = checked.reduce(
		(sum, measurement) => sum + measurement.cases.length,
		0,
	);
	const correct = checked.reduce(
		(sum, measurement) =>
			sum + measurement.cases.filter((scored) => right(scored)).length,
		0,
	);
	const accuracy = total === 0 ? 0 : (correct / total) * 100;
	lines.push(
		"",
		(wrong.length === 0 ? color.green : color.yellow)(
			`${wrong.length === 0 ? "✔" : "✖"} ${correct} of ${total} ${plural(total, "case")} right (${accuracy.toFixed(1)}%) across ${checked.length} ${plural(checked.length, "rule")}`,
		),
	);
	const uncased = measured.filter(
		(measurement) => measurement.cases.length === 0,
	);
	if (uncased.length > 0) {
		lines.push(
			color.dim(
				`  ${uncased.length} ${plural(uncased.length, "rule")} with no cases in evals/: ${uncased.map((measurement) => measurement.rule).join(", ")}`,
			),
		);
	}
	return lines;
}

/** What the rule did wrong on the case. */
function why(scored: Scored): string {
	if (scored.error !== undefined) {
		return `threw: ${scored.error}`;
	}
	if (scored.kind === "bad") {
		return "missed: reported nothing";
	}
	return scored.findings
		.map(
			(finding) =>
				`line ${finding.line}: ${finding.message} (${Math.round(finding.confidence * 100)}%)`,
		)
		.join("; ");
}
