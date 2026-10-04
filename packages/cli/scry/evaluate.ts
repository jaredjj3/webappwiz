import {
	type Effort,
	Evaluation,
	type EvaluationReport,
	Git,
	type Judge,
	Rules,
} from "@webappwiz/scry";
import { ConsoleLogger, color, type Logger } from "webappwiz/log";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import { ProjectCredentials } from "../credentials/project-credentials";
import { loadConfig } from "../load-config";
import { table } from "../table";
import { HostedProviders, type Providers } from "./providers";

export interface EvaluateOptions {
	/** The rules to judge, by id; none judges every rule the project has. */
	ids: string[];
	/** The model every rule is judged by, over the config's `models`. */
	model?: string;
	/** How many examples are judged at once, over the config's `jobs`. */
	jobs?: number;
	/** `json` for the report as JSON; anything else is text. */
	format: string;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	/** What makes the judge for a model; Workers AI and TypeSafe by default. */
	providers?: Providers;
}

/**
 * Judges the project's rules against cases whose answers are known, the files
 * in each rule's `evals/` and the Good and Bad examples in its `RULE.md`, so
 * two models can be compared, and a rule's threshold or wording tuned. It exits 2 when an example went
 * unchecked, and 0 otherwise: getting one wrong is a measurement, not a
 * failure.
 */
export async function evaluate(opts: EvaluateOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();
	const { root: dir } = await Git.locate(ps.cwd(), [], { ps });
	const all = (await Rules.load(dir, { fs })).all;
	const unknown = opts.ids.filter((id) => !all.some((rule) => rule.id === id));
	if (unknown.length > 0) {
		throw new Error(
			`no rule ${unknown.join(", ")} in ${dir}/.wiz/scry: \`wiz scry list\` names them`,
		);
	}
	const rules =
		opts.ids.length === 0
			? all
			: all.filter((rule) => opts.ids.includes(rule.id));
	const settings = await loadConfig(dir, { fs, ps });
	const evaluation = await Evaluation.prepare({ dir, rules, fs });
	const providers =
		opts.providers ??
		new HostedProviders(
			(await ProjectCredentials.open(dir, { fs, ps })).credentials,
		);
	const models = new Map<Effort, string>();
	const judges = new Map<Effort, Judge>();
	for (const effort of evaluation.efforts) {
		if (effort !== "none") {
			const model = opts.model ?? settings.models[effort];
			models.set(effort, model);
			judges.set(effort, await providers.judge(model));
		}
	}

	log.error(
		color.blue(
			`judging ${evaluation.size} ${plural(evaluation.size, "example")}, ${Math.min(opts.jobs ?? settings.jobs, evaluation.size)} at a time`,
		),
	);
	const report = await evaluation.run({
		judges,
		jobs: opts.jobs ?? settings.jobs,
	});
	log.info(
		opts.format === "json"
			? JSON.stringify(
					{
						...report,
						rules: report.rules.map((rule) => ({
							...rule,
							model: models.get(rule.effort),
						})),
					},
					null,
					2,
				)
			: text(report, models).join("\n"),
	);
	if (report.unchecked.length > 0) {
		ps.exit(2);
	}
}

/** A row a rule, each example it got wrong under it, then a tally. */
function text(
	report: EvaluationReport,
	models: ReadonlyMap<Effort, string>,
): string[] {
	const rows = table(
		report.rules.map((rule) => {
			const right = rule.examples.filter((example) => example.right).length;
			return [
				color.bold(rule.rule),
				color.dim(rule.effort),
				models.get(rule.effort) ?? "",
				rule.examples.length === 0
					? color.dim("no examples")
					: (right === rule.examples.length ? color.green : color.yellow)(
							`${right} of ${rule.examples.length} right`,
						),
			];
		}),
	);
	// each wrong case under its rule's row, outside the table, so a long
	// source widens none of its columns
	const lines = report.rules.flatMap((rule, index) => [
		rows[index] ?? "",
		...rule.examples
			.filter((example) => !example.right)
			.map(
				(example) =>
					`  ${color.yellow("✖")} ${example.source}: ${percent(example.probability)}, ${example.kind === "bad" ? "under" : "at or over"} its ${percent(rule.threshold)} threshold`,
			),
	]);
	if (report.unchecked.length > 0) {
		lines.push(
			"",
			color.bold("not checked"),
			...table(
				report.unchecked.map((item) => [`  ${item.subject}`, item.reason]),
			),
		);
	}
	const examples = report.rules.flatMap((rule) => rule.examples);
	const right = examples.filter((example) => example.right).length;
	const tally = `${right} of ${examples.length} ${plural(examples.length, "example")} judged right across ${report.rules.length} ${plural(report.rules.length, "rule")}`;
	lines.push(
		"",
		right === examples.length
			? color.green(`✔ ${tally}`)
			: color.yellow(`✖ ${tally}`),
	);
	if (report.usage) {
		lines.push(
			color.dim(
				`  spent ${report.usage.input} input tokens across ${report.usage.calls} ${plural(report.usage.calls, "call")}`,
			),
		);
	}
	return lines;
}

function percent(probability: number): string {
	return `${Math.round(probability * 100)}%`;
}

function plural(count: number, noun: string): string {
	return count === 1 ? noun : `${noun}s`;
}
