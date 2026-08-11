import { Markdown } from "@webappwiz/md";

/** What a violation of a rule counts as, and what a diagnostic counts as. */
export type Level = "error" | "warning";

/** A problem a check found, before the linter stamps file and severity on it. */
export interface Finding {
	/** 1-based. */
	line: number;
	/** 1-based. */
	column: number;
	message: string;
}

/**
 * The deterministic half of a rule: reads a file's text and decides, the way
 * any linter does. Attached to a rule with `rule(path, { check })`.
 */
export type Check = (text: string) => Finding[];

/**
 * A rule compiled out of its markdown file. `text` is the whole document, what
 * an analysis agent receives verbatim, so the structured fields never drift
 * from what the agent reads. A rule with a `check` is enforced by the linter;
 * one without is judged by an agent; a `partial` check is both, the linter
 * deciding the cases it can and the agent the rest.
 */
export interface Rule {
	/** The document's title, for a human to read. */
	name: string;
	/** The rule's file name without its extension: what a report cites. */
	id: string;
	path: string;
	/** Glob (frontmatter `files`) choosing which files the rule applies to. */
	files: string;
	/** How loudly a violation reports (frontmatter `level`, default error). */
	level: Level;
	description: string;
	good: string[];
	bad: string[];
	text: string;
	check?: Check;
	/** True when the check decides only some of the rule's cases, so the rule
	 * still needs an agent. A full check takes the rule off the agent's plate. */
	partial?: boolean;
}

/** A check's finding, stamped with where it was and which rule said so. */
export interface Diagnostic extends Finding {
	path: string;
	rule: string;
	severity: Level;
}

/** A problem with a guide or a rule file itself, rather than with code. */
export interface GuideDiagnostic {
	path: string;
	/** 1-based source line, when the problem has one. */
	line?: number;
	severity: Level;
	message: string;
}

/**
 * Compiles one rule file. Collects every problem instead of throwing on the
 * first, so a check run reports the whole document at once; the rule is null
 * exactly when there is at least one error.
 */
export function compile(
	text: string,
	path: string,
	opts: { check?: Check; partial?: boolean } = {},
): { rule: Rule | null; diagnostics: GuideDiagnostic[] } {
	const diagnostics: GuideDiagnostic[] = [];
	const error = (message: string, line?: number) =>
		diagnostics.push({ path, line, severity: "error", message });
	const warn = (message: string, line?: number) =>
		diagnostics.push({ path, line, severity: "warning", message });

	if (opts.partial && !opts.check) {
		error(
			"partial without a check: partial says what a check is, so attach one",
		);
	}
	const md = Markdown.parse(text);
	const files = md.fields.files;
	if (files === undefined || files === "") {
		error('missing "files" glob in frontmatter');
	}
	const level = md.fields.level ?? "error";
	if (level !== "error" && level !== "warning") {
		error(`level must be "error" or "warning", not "${level}"`);
	}
	const title = md.title;
	if (title === null) {
		error("missing title (# heading)");
	} else if (md.section(title).lead === "") {
		warn("no description under the title", md.section(title).line);
	}

	for (const name of ["Good", "Bad"] as const) {
		if (!md.has(name)) {
			(name === "Good" ? error : warn)(`no ## ${name} section`);
		} else if (md.section(name).codeBlocks().length === 0) {
			error(
				`## ${name} section has no fenced code block`,
				md.section(name).line,
			);
		}
	}
	for (const s of md.sections.filter((s) => s.level === 2)) {
		if (!["good", "bad"].includes(s.heading.toLowerCase())) {
			warn(`unrecognized section "## ${s.heading}"`, s.line);
		}
	}
	for (const s of md.sections) {
		// lead, not body: a fence reports once, at its nearest heading
		for (const block of s.codeBlocks("lead")) {
			if (block.lang === "") {
				warn(`fenced block in "${s.heading}" has no language tag`, s.line);
			}
		}
	}

	if (diagnostics.some((d) => d.severity === "error")) {
		return { rule: null, diagnostics };
	}
	return {
		rule: {
			// biome-ignore lint/style/noNonNullAssertion: errors above guarantee both
			name: title!,
			id: path.split("/").pop()?.replace(/\.md$/, "") ?? path,
			path,
			// biome-ignore lint/style/noNonNullAssertion: errors above guarantee both
			files: files!,
			level: level as Level,
			description: md.section(title ?? "").lead,
			good: md
				.section("Good")
				.codeBlocks()
				.map((b) => b.code),
			bad: md.has("Bad")
				? md
						.section("Bad")
						.codeBlocks()
						.map((b) => b.code)
				: [],
			text,
			check: opts.check,
			partial: opts.partial,
		},
		diagnostics,
	};
}

/** Guide-level problems no single file can see: duplicate rule names. */
export function checkGuide(rules: Rule[]): GuideDiagnostic[] {
	const seen = new Map<string, Rule>();
	const diagnostics: GuideDiagnostic[] = [];
	for (const rule of rules) {
		const first = seen.get(rule.name);
		if (first) {
			diagnostics.push({
				path: rule.path,
				severity: "error",
				message: `duplicate rule name "${rule.name}" (also ${first.path})`,
			});
		} else {
			seen.set(rule.name, rule);
		}
	}
	return diagnostics;
}
