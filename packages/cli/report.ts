import type { Finished, Violation } from "@webappwiz/judge";
import { color } from "@webappwiz/log";
import type { Duration } from "@webappwiz/time";
import { floor, type Overheads, predict, priced } from "./cost";
import { table } from "./table";

export const count = (total: number, word: string): string =>
	`${total} ${word}${total === 1 ? "" : "s"}`;

const compact = new Intl.NumberFormat("en", { notation: "compact" });

/**
 * Four decimals, because a single agent call costs cents: a run's total wants
 * two and one task wants four, and one format both can live in beats a reader
 * having to notice which of two they are looking at.
 */
const money = new Intl.NumberFormat("en", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 2,
	maximumFractionDigits: 4,
});

export const usd = (amount: number): string => money.format(amount);

/**
 * What a plan costs to read, at the four-bytes-a-token rule of thumb. Rough on
 * purpose: an estimate that needed a tokenizer, or an API call to count, would
 * be one more thing to install and one more thing to be wrong about, and the
 * decision it informs is only ever "is this the order of magnitude I meant".
 */
export const tokens = (bytes: number): number => Math.ceil(bytes / 4);

/**
 * Why the estimate is a floor: each call pays for the agent's own system
 * prompt and for whatever it re-reads as it works, none of which is knowable
 * from here.
 */
export function overBudget(
	estimate: number,
	budget: number,
	cost?: number,
): string {
	const money =
		cost === undefined ? "" : ` That is ${color.bold(usd(cost))} or more.`;
	return (
		`${color.yellow("!")} this run reads at least ` +
		`${color.bold(compact.format(estimate))} tokens, over the ` +
		`${color.bold(compact.format(budget))} budget, and the real cost will be higher.${money} ` +
		`Raise it with ${color.bold("--budget")}.`
	);
}

/**
 * The whole of what `--estimate` prints: the plan, then what it costs on each
 * agent that has a price.
 *
 * Two columns, because the floor alone is misleading. It prices the files a
 * plan can see, and a call also pays for the agent's own system prompt every
 * time, which on a small repo is most of the bill. `overheads` carries what
 * past runs measured that per-call charge to be, so an agent that has been run
 * here gets a second figure worth trusting.
 */
export function estimate(
	files: number,
	rules: number,
	calls: number,
	tokens: number,
	overheads: Overheads,
): string[] {
	const agents = priced();
	const measured = agents.some((agent) => overheads[agent] !== undefined);
	const rows = [["AGENT", "FLOOR", ...(measured ? ["MEASURED"] : [])]];
	for (const agent of agents) {
		const least = floor(agent, tokens) ?? 0;
		const whole =
			overheads[agent] === undefined
				? undefined
				: predict(agent, tokens, calls, overheads);
		rows.push([
			agent,
			`${usd(least)}+`,
			...(measured ? [whole === undefined ? "" : usd(whole)] : []),
		]);
	}
	return [
		planned(files, rules, calls, tokens),
		"",
		...table(rows).map((line) => `  ${line}`),
		"",
		color.gray(
			"floor: the listed input price for the files above, and nothing else. " +
				"Every call\nalso pays for the agent's own system prompt and for whatever it re-reads.",
		),
		...(measured
			? [
					color.gray(
						"measured: that floor plus what a call on the agent cost over it last time.",
					),
				]
			: [
					color.gray(
						"Run one of these and the estimate is measured against it next time.",
					),
				]),
	];
}

/**
 * The plan, before the first agent starts. Counts calls rather than tasks
 * because a call is what a run is billed for, and it is the denominator of the
 * `[n/total]` headings below. Without an `agent` it is the whole of what
 * `--estimate` prints, so it names no command it is not going to run.
 */
export function planned(
	files: number,
	rules: number,
	calls: number,
	estimate: number,
	agent?: string,
): string {
	// Each stat gets its own color, so the prose between them is grayed piece by
	// piece: a foreground color resets to the default rather than to whatever it
	// was nested in, so one gray around the whole line would not survive them.
	const plan =
		color.gray("checking ") +
		color.blue(count(files, "file")) +
		color.gray(" against ") +
		color.green(count(rules, "rule")) +
		color.gray(" in ") +
		color.yellow(count(calls, "agent call")) +
		color.gray(", reading ") +
		color.red(`${compact.format(estimate)}+ tokens`);
	return agent === undefined
		? plan
		: `${plan}${color.gray(", using: ")}${color.bold(agent)}`;
}

/**
 * A finished task, as it should print the moment its agent returns: a status
 * line naming the glob its rules share, then one finding per violation.
 */
export function finished({
	glob,
	rules,
	violations,
	took,
	cost,
	done,
	total,
}: Finished): string[] {
	const heading = `${color.gray(`[${done}/${total}]`)} ${glob} ${color.gray(`(${count(rules.length, "rule")})`)}`;
	// No dollars rather than a zero when the agent reported none: an `--exec`
	// command costing nothing and one that never said are different things.
	const spent = cost === undefined ? "" : `  ${usd(cost)}`;
	const tail = `${color.gray(`in ${took.human()}${spent}`)}`;
	if (violations.length === 0) {
		return [`${color.green("✓")} ${heading}: clean ${tail}`];
	}
	return [
		`${color.red("✗")} ${heading}: ${count(violations.length, "problem")} ${tail}`,
		...violations.flatMap(finding),
	];
}

/**
 * One violation: a location a reader can click, what the code does that the
 * rule forbids, and the line it happens on. The heading above names only the
 * glob, so the finding says which of its rules this one breaks.
 */
export function finding(violation: Violation): string[] {
	const level =
		violation.level === "error"
			? color.red("error")
			: color.yellow(violation.level);
	const lines = [
		`  ${color.bold(`${violation.file}:${violation.line}`)}  ${level}  ${violation.message} ${color.gray(`(${violation.id})`)}`,
	];
	if (violation.code !== "") {
		lines.push(color.gray(`  │ ${violation.code}`));
	}
	return lines;
}

export function summary(
	violations: Violation[],
	took: Duration,
	cost?: number,
): string {
	const spent = cost === undefined ? "" : `  ${usd(cost)} total`;
	const elapsed = color.gray(`in ${took.human()}${spent}`);
	if (violations.length === 0) {
		return `${color.green("✓ no violations")} ${elapsed}`;
	}
	const errors = violations.filter(
		(violation) => violation.level === "error",
	).length;
	const line = `✖ ${count(violations.length, "problem")} (${count(errors, "error")}, ${count(violations.length - errors, "warning")})`;
	return `${errors > 0 ? color.red(line) : color.yellow(line)} ${elapsed}`;
}
