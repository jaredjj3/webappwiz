import {
	type FileRule,
	type FileText,
	Hit,
	type Verdict,
} from "@webappwiz/rules";
import doc from "./no-em-dashes.md" with { type: "text" };

export class NoEmDashes implements FileRule {
	// Escaped, since this file is one the rule reads.
	private static readonly EM = "\u2014";
	private static readonly EN = "\u2013";
	private static readonly EM_MESSAGE =
		"em dash: use a colon, comma, parentheses, or a full stop";
	private static readonly EN_MESSAGE =
		"en dash between words: only a digit range keeps one";

	readonly id = "no-em-dashes";
	readonly files = "**/*.{ts,md}";
	readonly level = "error";
	readonly document = doc;

	check({ text }: FileText): Verdict {
		const findings: Hit[] = [];
		for (const [i, line] of text.split("\n").entries()) {
			for (const match of line.matchAll(/[\u2013\u2014]/g)) {
				if (match[0] === NoEmDashes.EN && this.range(line, match.index)) {
					continue;
				}
				findings.push(
					new Hit(
						i + 1,
						match.index + 1,
						match[0] === NoEmDashes.EM
							? NoEmDashes.EM_MESSAGE
							: NoEmDashes.EN_MESSAGE,
					),
				);
			}
		}
		return { findings };
	}

	/** Whether the dash at `column` of `line` sits between two digits. */
	private range(line: string, column: number): boolean {
		return (
			/\d/.test(line[column - 1] ?? "") && /\d/.test(line[column + 1] ?? "")
		);
	}
}
