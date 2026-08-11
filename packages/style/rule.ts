import { Markdown } from "@webappwiz/md";

/**
 * A rule compiled out of its markdown file. `text` is the whole document, what
 * an analysis agent receives verbatim, so the structured fields never drift
 * from what the agent reads.
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
}

/** What a violation of a rule counts as, and what a diagnostic counts as. */
export type Level = "error" | "warning";

export interface Diagnostic {
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
): { rule: Rule | null; diagnostics: Diagnostic[] } {
	const diagnostics: Diagnostic[] = [];
	const error = (message: string, line?: number) =>
		diagnostics.push({ path, line, severity: "error", message });
	const warn = (message: string, line?: number) =>
		diagnostics.push({ path, line, severity: "warning", message });

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
		},
		diagnostics,
	};
}

/** Guide-level problems no single file can see: duplicate rule names. */
export function checkGuide(rules: Rule[]): Diagnostic[] {
	const seen = new Map<string, Rule>();
	const diagnostics: Diagnostic[] = [];
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
