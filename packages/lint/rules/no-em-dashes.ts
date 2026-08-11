import type { Finding, Rule } from "../rule";

const EM = "\u2014";

/**
 * Em dashes are the surest tell that a machine wrote the text. An en dash
 * between words counts too; between digits it is a range and stays.
 */
export const noEmDashes: Rule = {
	id: "no-em-dashes",
	files: "**/*.{ts,md}",
	level: "error",
	check(text) {
		const findings: Finding[] = [];
		for (const [i, line] of text.split("\n").entries()) {
			for (const match of line.matchAll(/[\u2013\u2014]/g)) {
				const range =
					/\d/.test(line[match.index - 1] ?? "") &&
					/\d/.test(line[match.index + 1] ?? "");
				if (match[0] !== EM && range) {
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
	},
};
