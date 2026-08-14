import { type Glob, NodeGlob } from "@webappwiz/sys";
import type { Diagnostic } from "./diagnostic";
import { exemptions } from "./ignore";
import type { FileRule, FileText } from "./rule";

/** One file a rule's check wants an agent to read. */
export interface Escalation {
	rule: FileRule;
	/** The file's path, as the caller named it. */
	path: string;
}

/** Everything one pass of the checks settled, and what they escalated. */
export interface Checked {
	diagnostics: Diagnostic[];
	/** Every file a rule asked an agent to read, in file order. */
	escalations: Escalation[];
}

/**
 * Runs rules' checks over in-memory files; listing and reading stay with the
 * caller. The checks are free and settle what they can. What they escalate is
 * an agent's job: reported here, run by whoever pays for the agent.
 */
export class Checker {
	private readonly glob: Glob;

	constructor(
		private readonly rules: FileRule[],
		glob?: Glob,
	) {
		this.glob = glob ?? new NodeGlob();
	}

	/** Whether any rule wants this file: lets a caller skip reading the rest. */
	matches(path: string): boolean {
		return this.rules.some((rule) => this.glob.matches(rule.files, path));
	}

	check(files: FileText[]): Checked {
		const diagnostics: Diagnostic[] = [];
		const escalations: Escalation[] = [];
		for (const file of files) {
			for (const rule of this.rules) {
				if (!this.glob.matches(rule.files, file.path)) {
					continue;
				}
				const { findings, escalate } = rule.check(file);
				if (escalate) {
					escalations.push({ rule, path: file.path });
				}
				if (findings.length === 0) {
					continue;
				}
				const excused = exemptions(file.text.split("\n"), rule.id);
				for (const finding of findings) {
					if (!excused(finding.line)) {
						diagnostics.push({
							...finding,
							path: file.path,
							rule: rule.id,
							severity: rule.level,
						});
					}
				}
			}
		}
		return { diagnostics, escalations };
	}
}
