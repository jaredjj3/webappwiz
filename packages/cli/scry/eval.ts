import {
	type Evaluation,
	Git,
	Progress,
	Rules,
	type Scored,
} from "@webappwiz/scry";
import { ConsoleLogger, color, type Logger } from "webappwiz/log";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import { SystemTimer, type Timer } from "webappwiz/time";
import type { Effort } from "../config";
import { chooseModels, loadConfig } from "../load-config";
import { table } from "../table";
import { asked, ProjectTools, plural } from "./project-tools";
import type { Providers } from "./providers";
import type { Screen } from "./screen";
import { Spinner } from "./spinner";

export interface EvaluateOptions {
	/** Rule ids; every rule when empty. */
	ids: string[];
	/** How many requests to the model are out at once, over the config's `jobs`. */
	jobs?: number;
	/** Which of the config's `models` to ask, over the config's `effort`. */
	effort?: Effort;
	/** The model a rule's `decider` asks, over the effort's. */
	model?: string;
	/** The model a rule's `llm` asks, over the effort's. */
	llm?: string;
	/** `json` for the scores as JSON; anything else is text. */
	format: string;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	providers?: Providers;
	/**
	 * Where a line of progress is drawn while the rules are scored, when it
	 * is live and the scores are text. None draws nothing.
	 */
	screen?: Screen;
	/** What ticks that line. */
	timer?: Timer;
}

/**
 * Scores each rule on its labeled cases, the way `wiz scry` would run it: a
 * bad case is right when the rule reports something in it, a good one when
 * it reports nothing. Names every case it got wrong, and what that cost.
 */
export async function evaluate(opts: EvaluateOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();
	const { root: dir } = await Git.locate(ps.cwd(), [], { ps });
	const rules = await Rules.load(dir, { fs });
	const settings = await loadConfig(dir, { fs, ps });
	const asking = await ProjectTools.open(dir, {
		models: chooseModels(settings, opts),
		jobs: opts.jobs ?? settings.jobs,
		providers: opts.providers,
		fs,
		ps,
	});
	const progress = new Progress();
	const spinner =
		opts.screen === undefined || opts.format === "json"
			? undefined
			: new Spinner({
					screen: opts.screen,
					timer: opts.timer ?? new SystemTimer(),
					progress,
					asking,
					verb: "scoring",
					noun: "case",
				});
	spinner?.start();
	const evaluated = await rules
		.evaluate({ ids: opts.ids, tools: asking.tools, progress })
		.finally(() => spinner?.dispose());
	await asking.save();
	if (opts.format === "json") {
		log.info(
			JSON.stringify({ rules: evaluated, spent: asking.spent }, null, 2),
		);
		return;
	}
	log.info(text(evaluated).join("\n"));
	if (asking.spent.questions + asking.spent.cached > 0) {
		log.info(color.dim(asked(asking.spent)));
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
function text(evaluated: Evaluation[]): string[] {
	const checked = evaluated.filter((evaluation) => evaluation.cases.length > 0);
	const rows = checked.map((evaluation) => {
		const { cases } = evaluation;
		const wrong = cases.filter((scored) => !right(scored));
		const missed = wrong.filter((scored) => scored.kind === "bad").length;
		return [
			evaluation.rule,
			`${cases.length - wrong.length}/${cases.length}`,
			missed === 0 ? "-" : String(missed),
			wrong.length - missed === 0 ? "-" : String(wrong.length - missed),
		];
	});
	const lines = table([
		["rule", "right", "missed", "false alarms"].map(color.dim),
		...rows,
	]);
	const wrong = checked.flatMap((evaluation) =>
		evaluation.cases
			.filter((scored) => !right(scored))
			.map((scored) => [`  ${evaluation.rule}`, scored.name, why(scored)]),
	);
	if (wrong.length > 0) {
		lines.push("", color.bold("wrong"), ...table(wrong));
	}
	const total = checked.reduce(
		(sum, evaluation) => sum + evaluation.cases.length,
		0,
	);
	const correct = checked.reduce(
		(sum, evaluation) =>
			sum + evaluation.cases.filter((scored) => right(scored)).length,
		0,
	);
	const accuracy = total === 0 ? 0 : (correct / total) * 100;
	lines.push(
		"",
		(wrong.length === 0 ? color.green : color.yellow)(
			`${wrong.length === 0 ? "✔" : "✖"} ${correct} of ${total} ${plural(total, "case")} right (${accuracy.toFixed(1)}%) across ${checked.length} ${plural(checked.length, "rule")}`,
		),
	);
	const uncased = evaluated.filter(
		(evaluation) => evaluation.cases.length === 0,
	);
	if (uncased.length > 0) {
		lines.push(
			color.dim(
				`  ${uncased.length} ${plural(uncased.length, "rule")} with no cases in evals/: ${uncased.map((evaluation) => evaluation.rule).join(", ")}`,
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
