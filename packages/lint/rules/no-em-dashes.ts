import type { Check, Finding } from "../rule";

const EM = "\u2014";
const EN = "\u2013";

/** Whether the dash at `column` of `line` sits between two digits. */
const range = (line: string, column: number): boolean =>
	/\d/.test(line[column - 1] ?? "") && /\d/.test(line[column + 1] ?? "");

/**
 * Em dashes are the surest tell that a machine wrote the text. An en dash
 * between words counts too; between digits it is a range and stays.
 */
export const noEmDashes: Check = (text) => {
	const findings: Finding[] = [];
	for (const [i, line] of text.split("\n").entries()) {
		for (const match of line.matchAll(/[\u2013\u2014]/g)) {
			if (match[0] === EN && range(line, match.index)) {
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
};
