import { Markdown } from "@webappwiz/md";
import type { GuideDiagnostic, Level } from "./diagnostic";
import type { Rule } from "./rule/rule";

/**
 * A rule's markdown, parsed: the title and examples a report reads, and
 * everything wrong with the document itself.
 *
 * The examples are the check's conformance suite, so a document that has none
 * is an error rather than a matter of taste.
 */
export class RuleDocument {
	private readonly markdown: Markdown;

	constructor(private readonly rule: Rule) {
		this.markdown = Markdown.parse(rule.document);
	}

	/** The document's title, for a human to read, and the rule's id until it
	 * has one: a missing title is a diagnostic, not a hole in every report. */
	get title(): string {
		return this.markdown.title ?? this.rule.id;
	}

	/** The prose under the title. */
	get description(): string {
		const title = this.markdown.title;
		return title === null ? "" : this.markdown.section(title).lead;
	}

	/** Code the check must accept. */
	get good(): string[] {
		return this.examples("Good");
	}

	/** Code the check must catch, unless it only decides part of the rule. */
	get bad(): string[] {
		return this.examples("Bad");
	}

	/** Everything wrong with the document, as `rules audit` reports it. */
	diagnostics(): GuideDiagnostic[] {
		const found: GuideDiagnostic[] = [];
		const title = this.markdown.title;
		if (title === null) {
			found.push(this.problem("error", "missing title (# heading)"));
		} else if (this.markdown.section(title).lead === "") {
			found.push(
				this.problem(
					"warning",
					"no description under the title",
					this.markdown.section(title).line,
				),
			);
		}
		for (const name of ["Good", "Bad"] as const) {
			if (!this.markdown.has(name)) {
				found.push(
					this.problem(
						name === "Good" ? "error" : "warning",
						`no ## ${name} section`,
					),
				);
			} else if (this.markdown.section(name).codeBlocks().length === 0) {
				found.push(
					this.problem(
						"error",
						`## ${name} section has no fenced code block`,
						this.markdown.section(name).line,
					),
				);
			}
		}
		for (const section of this.markdown.sections.filter(
			(candidate) => candidate.level === 2,
		)) {
			if (!["good", "bad"].includes(section.heading.toLowerCase())) {
				found.push(
					this.problem(
						"warning",
						`unrecognized section "## ${section.heading}"`,
						section.line,
					),
				);
			}
		}
		for (const section of this.markdown.sections) {
			// lead, not body: a fence reports once, at its nearest heading
			for (const block of section.codeBlocks("lead")) {
				if (block.lang === "") {
					found.push(
						this.problem(
							"warning",
							`fenced block in "${section.heading}" has no language tag`,
							section.line,
						),
					);
				}
			}
		}
		return found;
	}

	private examples(heading: "Good" | "Bad"): string[] {
		return this.markdown.has(heading)
			? this.markdown
					.section(heading)
					.codeBlocks()
					.map((block) => block.code)
			: [];
	}

	private problem(
		severity: Level,
		message: string,
		line?: number,
	): GuideDiagnostic {
		return { rule: this.rule.id, line, severity, message };
	}
}
