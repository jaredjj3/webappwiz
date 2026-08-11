import type { Finished, Violation } from "@webappwiz/lint";
import { color } from "@webappwiz/log";
import type { Duration } from "@webappwiz/time";

export const count = (n: number, word: string): string =>
	`${n} ${word}${n === 1 ? "" : "s"}`;

const compact = new Intl.NumberFormat("en", { notation: "compact" });

/**
 * What a plan costs to read, at the four-bytes-a-token rule of thumb. Rough on
 * purpose: an estimate that needed a tokenizer, or an API call to count, would
 * be one more thing to install and one more thing to be wrong about, and the
 * decision it informs is only ever "is this the order of magnitude I meant".
 */
export const tokens = (bytes: number): number => Math.ceil(bytes / 4);

/**
 * Why the estimate is a floor: the same file is read once per rule that globs
 * it, and on top of that each call pays for the agent's own system prompt and
 * for whatever it re-reads as it works, none of which is knowable from here.
 */
export function overBudget(estimate: number, budget: number): string {
	return (
		`${color.yellow("!")} this run reads at least ` +
		`${color.bold(compact.format(estimate))} tokens, over the ` +
		`${color.bold(compact.format(budget))} budget, and the real cost will be higher. ` +
		`Raise it with ${color.bold("--budget")}.`
	);
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
 * line naming the rule, then one finding per violation.
 */
export function finished({
	rule,
	id,
	violations,
	took,
	done,
	total,
}: Finished): string[] {
	const heading = `${color.gray(`[${done}/${total}]`)} ${rule} ${color.gray(`(${id})`)}`;
	const tail = `${color.gray(`in ${took.human()}`)}`;
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
 * rule forbids, and the line it happens on. The rule is the heading above, so
 * it is not repeated here.
 */
export function finding(v: Violation): string[] {
	const level =
		v.level === "error" ? color.red("error") : color.yellow(v.level);
	const lines = [
		`  ${color.bold(`${v.file}:${v.line}`)}  ${level}  ${v.message}`,
	];
	if (v.code !== "") {
		lines.push(color.gray(`  │ ${v.code}`));
	}
	return lines;
}

export function summary(violations: Violation[], took: Duration): string {
	const elapsed = color.gray(`in ${took.human()}`);
	if (violations.length === 0) {
		return `${color.green("✓ no violations")} ${elapsed}`;
	}
	const errors = violations.filter((v) => v.level === "error").length;
	const line = `✖ ${count(violations.length, "problem")} (${count(errors, "error")}, ${count(violations.length - errors, "warning")})`;
	return `${errors > 0 ? color.red(line) : color.yellow(line)} ${elapsed}`;
}
