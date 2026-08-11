import { Finding } from "../finding";
import doc from "./no-ponytail-prefixes.md" with { type: "text" };
import type { Rule } from "./rule";

export class NoPonytailPrefixes implements Rule {
	// The tag has to open the comment to be a prefix, which is also what keeps
	// this file, one the rule reads, from matching itself: prose mentioning the
	// tag mid-sentence is not what the rule is about.
	private static readonly PREFIX =
		/(\/\/+\s*|\/\*+\s*|^\s*\*\s*)(ponytail\s*:)/gi;
	private static readonly MESSAGE = "comment carries a ponytail: prefix";

	readonly id = "no-ponytail-prefixes";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;

	check(text: string): Finding[] {
		const findings: Finding[] = [];
		for (const [i, line] of text.split("\n").entries()) {
			for (const match of line.matchAll(NoPonytailPrefixes.PREFIX)) {
				findings.push(
					new Finding(
						i + 1,
						match.index + (match[1]?.length ?? 0) + 1,
						NoPonytailPrefixes.MESSAGE,
					),
				);
			}
		}
		return findings;
	}
}
