import type { Finding, Level, Rule } from "../rule";

const EM = "\u2014";
const EN = "\u2013";

/**
 * Em dashes are the surest tell that a machine wrote the text. An en dash
 * between words counts too; between digits it is a range and stays.
 */
export class NoEmDashes implements Rule {
	readonly id = "no-em-dashes";
	readonly files = "**/*.{ts,md}";
	readonly level: Level = "error";

	check(text: string): Finding[] {
		const findings: Finding[] = [];
		for (const [i, line] of text.split("\n").entries()) {
			for (const match of line.matchAll(/[\u2013\u2014]/g)) {
				if (match[0] === EN && this.range(line, match.index)) {
					continue;
				}
				findings.push({
					line: i + 1,
					column: match.index + 1,
					message:
						match[0] === EM
							? "em dash: use a colon, comma, parentheses, or a full stop"
							: "en dash between words: only a digit range keeps one",
				});
			}
		}
		return findings;
	}

	/** Whether the dash at `column` of `line` sits between two digits. */
	private range(line: string, column: number): boolean {
		return (
			/\d/.test(line[column - 1] ?? "") && /\d/.test(line[column + 1] ?? "")
		);
	}
}
