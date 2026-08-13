import { type Config, DEFAULT_CONFIG } from "./config";
import type { ConfigLoader } from "./config-loader/config-loader";
import { ModuleConfigLoader } from "./config-loader/module-config-loader";
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
	 * The project's config. A project without one analyzes nothing: there is no
	 * recommended set to fall back on, because a rule that runs is a rule the
	 * project named.
	 */
	async load(
		path: string = DEFAULT_CONFIG,
	): Promise<{ config: Config; diagnostics: ConfigDiagnostic[] }> {
		const config = await this.loader.load(path);
		return { config, diagnostics: this.diagnostics(config.rules) };
	}

	private diagnostics(rules: Rule[]): ConfigDiagnostic[] {
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
		return diagnostics;
	}
}
