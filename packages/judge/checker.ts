import { Glob } from "bun";
import type { Diagnostic } from "./diagnostic";
import { exemptions } from "./ignore";
import type { Rule } from "./rule/rule";

export interface FileText {
	path: string;
	text: string;
}

/**
 * Runs rules' checks over in-memory files; listing and reading stay with the
 * caller. Rules without a check are an agent's job, not this one's, and are
 * skipped.
 */
export class Checker {
	private readonly matchers: Array<{ rule: Rule; glob: Glob }>;

	constructor(rules: Rule[]) {
		this.matchers = rules.flatMap((rule) =>
			rule.check ? [{ rule, glob: new Glob(rule.files) }] : [],
		);
	}

	/** Whether any check wants this file: lets a caller skip reading the rest. */
	matches(path: string): boolean {
		return this.matchers.some(({ glob }) => glob.match(path));
	}

	check(files: FileText[]): Diagnostic[] {
		const diagnostics: Diagnostic[] = [];
		for (const { path, text } of files) {
			for (const { rule, glob } of this.matchers) {
				if (!glob.match(path)) {
					continue;
				}
				const findings = rule.check?.(text) ?? [];
				if (findings.length === 0) {
					continue;
				}
				const excused = exemptions(text.split("\n"), rule.id);
				for (const finding of findings) {
					if (!excused(finding.line)) {
						diagnostics.push({
							...finding,
							path,
							rule: rule.id,
							severity: rule.level,
						});
					}
				}
			}
		}
		return diagnostics;
	}
}
