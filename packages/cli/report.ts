import type { Violation } from "@webappwiz/rules";
import { color } from "webappwiz/log";
import type { Duration } from "webappwiz/time";
import { table } from "./table";

export const count = (total: number, word: string): string =>
	`${total} ${word}${total === 1 ? "" : "s"}`;

/**
 * Where one printed document stops and the next starts, named so a reader
 * knows which one they are in without scrolling back.
 *
 * What `--print` writes is pages of markdown with headings of its own, so a
 * heading is not enough to mark a boundary. Unnamed, this is the closing line
 * the last document wants as much as the others want an opening one.
 */
export const divider = (name?: string): string => {
	if (name === undefined) {
		return color.dim("-".repeat(72));
	}
	const opening = `--- ${name} `;
	// A review carrying a dozen rule ids is named past the width, and a line that
	// stopped at the name would read as a heading rather than as a rule off.
	return color.dim(opening.padEnd(Math.max(72, opening.length + 3), "-"));
};

/** How every token figure prints: "14K", not "14,000". */
export const compact = new Intl.NumberFormat("en", { notation: "compact" });

/**
 * What a plan costs to read, at the four-bytes-a-token rule of thumb. Rough on
 * purpose: an estimate that needed a tokenizer, or an API call to count, would
 * be one more thing to install and one more thing to be wrong about, and the
 * decision it informs is only ever "is this the order of magnitude I meant".
 */
export const tokens = (bytes: number): number => Math.ceil(bytes / 4);

/**
 * The plan, before the first agent starts. Counts calls rather than reviews
 * because a call is what a run spawns, and it is the denominator of the
 * `[n/total]` headings below.
 */
export interface Planned {
	files: number;
	rules: number;
	calls: number;
	/** Tokens the plan can see, which is a floor on what the run reads. */
	estimate: number;
	/** Agent calls in flight at once, which is what the wall clock turns on. */
	concurrency?: number;
	/** The command the run will spawn. */
	agent?: string;
}

export function planned({
	files,
	rules,
	calls,
	estimate,
	concurrency,
	agent,
}: Planned): string[] {
	// A table rather than a sentence: these are five numbers a reader scans for
	// one of, and a line of prose makes them hunt for it every time. The labels
	// are dim and the figures plain, so a scan lands on the numbers.
	const rows = [
		[color.dim("files"), String(files)],
		[color.dim("rules"), String(rules)],
		[
			color.dim("calls"),
			String(calls) +
				(concurrency === undefined
					? ""
					: color.dim(`, ${concurrency} at a time`)),
		],
		[color.dim("reading"), `${compact.format(estimate)}+ tokens`],
	];
	if (agent !== undefined) {
		rows.push([color.dim("agent"), agent]);
	}
	// A blank line either side: this is the top of everything a run prints, and
	// it wants air between the table, whatever the shell left above it, and the
	// findings that follow.
	return ["", ...table(rows).map((line) => `  ${line}`), ""];
}

/** A finished review as the report prints it: what the call covered, what it
 * found, and what it read. */
export interface Finished {
	/** The ids of the rules the review checked. */
	rules: string[];
	/** How many files this review's agent was told to read. */
	files: number;
	violations: Violation[];
	/** How long this review's agent took. */
	took: Duration;
	/** Tokens this review's call touched, when the agent reported usage. */
	tokens?: number;
	/** Which worker ran the call, 0-based. */
	worker: number;
	/** Tokens that worker has touched so far, this review included. */
	workerTokens?: number;
	done: number;
	total: number;
}

/**
 * A finished review, as it should print the moment its agent returns: a status
 * line sizing the call, then one finding per violation.
 */
export function finished({
	rules,
	files,
	violations,
	took,
	tokens,
	worker,
	workerTokens,
	done,
	total,
}: Finished): string[] {
	// No rule ids: a review carries up to a dozen of them, they repeat on every
	// line of the report, and the finding under the heading names the one that
	// matters anyway.
	const heading =
		`${color.gray(`[${done}/${total}]`)} ` +
		color.gray(`(${count(rules.length, "rule")}, ${count(files, "file")})`);
	// No tokens rather than a zero when the agent reported none: an `--exec`
	// command reading nothing and one that never said are different things.
	// Workers are named from 1, the way the run counts its calls.
	const spent =
		tokens === undefined
			? ""
			: `  ${compact.format(tokens)} tokens` +
				(workerTokens === undefined
					? ""
					: ` (w${worker + 1}: ${compact.format(workerTokens)})`);
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
	tokens?: number,
): string {
	const spent =
		tokens === undefined ? "" : `  ${compact.format(tokens)} tokens total`;
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
