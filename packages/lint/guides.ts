import { resolve } from "node:path";
import type { Fs } from "@webappwiz/sys";
import type { GuideDiagnostic } from "./diagnostic";
import { DEFAULT_GUIDE } from "./guide";
import { type GuideLoader, ModuleGuideLoader } from "./loader";
import { recommended } from "./recommended";
import type { Rule } from "./rule/rule";
import { RuleDocument } from "./rule-document";

/** The rules a run lints against, and everything wrong with them. A rule whose
 * document is broken still checks: only its report suffers. */
export class Guides {
	constructor(
		private readonly fs: Fs,
		private readonly loader: GuideLoader = new ModuleGuideLoader(),
	) {}

	/**
	 * The project's guide: `lint.config.ts` when the project has one, and the
	 * recommended rules when it does not, the way any linter defaults.
	 */
	async project(
		path: string = DEFAULT_GUIDE,
	): Promise<{ rules: Rule[]; diagnostics: GuideDiagnostic[] }> {
		if (path === DEFAULT_GUIDE && !(await this.fs.exists(resolve(path)))) {
			return this.checked(recommended);
		}
		return this.load(path);
	}

	/** Every rule a guide module names, with everything wrong with them. */
	async load(
		path: string,
	): Promise<{ rules: Rule[]; diagnostics: GuideDiagnostic[] }> {
		const guide = await this.loader.load(path);
		return this.checked(guide.rules);
	}

	private checked(rules: Rule[]): {
		rules: Rule[];
		diagnostics: GuideDiagnostic[];
	} {
		const diagnostics = rules.flatMap((rule) =>
			new RuleDocument(rule).diagnostics(),
		);
		const seen = new Set<string>();
		for (const rule of rules) {
			if (seen.has(rule.id)) {
				diagnostics.push({
					rule: rule.id,
					severity: "error",
					message: `duplicate rule id "${rule.id}"`,
				});
			}
			seen.add(rule.id);
		}
		return { rules, diagnostics };
	}
}
