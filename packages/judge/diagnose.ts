import { duplicates } from "@webappwiz/rules";
import type { ConfigDiagnostic } from "./diagnostic";
import type { Rule } from "./rule/rule";
import { RuleDocument } from "./rule-document";

/**
 * Everything wrong with a rule set's own rules, rather than with code: a
 * document that will not parse, and two rules answering to one id.
 *
 * A rule whose document is broken still checks; only its report suffers. An
 * id claimed twice is the one that cannot be reported honestly, since a
 * finding citing it points at either of two rules.
 */
export function diagnose(rules: Rule[]): ConfigDiagnostic[] {
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
