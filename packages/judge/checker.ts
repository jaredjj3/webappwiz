import type { Glob } from "@webappwiz/sys";
import type { Diagnostic } from "./diagnostic";
import { exemptions } from "./ignore";
import {
	type Checked,
	hasCheck,
	type PartlyChecked,
	type Rule,
} from "./rule/rule";

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
	private readonly checked: Array<Checked | PartlyChecked>;

	constructor(
		rules: Rule[],
		private readonly glob: Glob,
	) {
		this.checked = rules.filter(hasCheck);
	}

	/** Whether any check wants this file: lets a caller skip reading the rest. */
	matches(path: string): boolean {
		return this.checked.some((rule) => this.glob.matches(rule.files, path));
	}

	check(files: FileText[]): Diagnostic[] {
		const diagnostics: Diagnostic[] = [];
		for (const { path, text } of files) {
			for (const rule of this.checked) {
				if (!this.glob.matches(rule.files, path)) {
					continue;
				}
				const findings = rule.check(text);
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
