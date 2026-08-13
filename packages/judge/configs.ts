import {
	type ConfigLoader,
	DEFAULT_CONFIG,
	duplicates,
	ModuleConfigLoader,
} from "@webappwiz/rules";
import { type Config, isConfig, SECTION } from "./config";
import type { ConfigDiagnostic } from "./diagnostic";
import type { Rule } from "./rule/rule";
import { RuleDocument } from "./rule-document";

/** The config a run analyzes against, and everything wrong with its rules. A
 * rule whose document is broken still checks: only its report suffers. */
export class Configs {
	constructor(
		private readonly loader: ConfigLoader = new ModuleConfigLoader(),
	) {}

	/**
	 * Judge's section of the project's config. A project without one analyzes
	 * nothing: there is no recommended set to fall back on, because a rule that
	 * runs is a rule the project named.
	 */
	async load(
		path: string = DEFAULT_CONFIG,
	): Promise<{ config: Config; diagnostics: ConfigDiagnostic[] }> {
		const section = await this.loader.load(path, SECTION);
		if (!isConfig(section)) {
			throw new Error(
				`${path} must default-export a \`${SECTION}\` section: ` +
					`\`export default { ${SECTION}: defineJudge({ rules: [...] }) }\``,
			);
		}
		return { config: section, diagnostics: this.diagnostics(section.rules) };
	}

	private diagnostics(rules: Rule[]): ConfigDiagnostic[] {
		const diagnostics = rules.flatMap((rule) =>
			new RuleDocument(rule).diagnostics(),
		);
		for (const id of duplicates(rules.map((rule) => rule.id))) {
			diagnostics.push({
				rule: id,
				severity: "error",
				message: `duplicate rule id "${id}"`,
			});
		}
		return diagnostics;
	}
}
