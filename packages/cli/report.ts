import { color } from "@webappwiz/log";
import type { Finished, Violation } from "@webappwiz/style";
import type { Duration } from "@webappwiz/time";

export const count = (n: number, word: string): string =>
	`${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The plan, before the first agent starts. Counts calls rather than tasks
 * because a call is what a run is billed for, and it is the denominator of the
 * `[n/total]` headings below.
 */
export function planned(
	files: number,
	rules: number,
	calls: number,
	agent: string,
): string {
	// blue last: it resets the foreground to default rather than to the
	// surrounding gray, so nothing may follow it
	return color.gray(
		`checking ${color.bold(count(files, "file"))} against ` +
			`${color.bold(count(rules, "rule"))} in ` +
			`${color.bold(count(calls, "agent call"))}, using: ` +
			color.blue(agent),
	);
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
		return `${color.green("✓ no style violations")} ${elapsed}`;
	}
	const errors = violations.filter((v) => v.level === "error").length;
	const line = `✖ ${count(violations.length, "problem")} (${count(errors, "error")}, ${count(violations.length - errors, "warning")})`;
	return `${errors > 0 ? color.red(line) : color.yellow(line)} ${elapsed}`;
}
