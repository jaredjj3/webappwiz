// Matched anywhere in a line, so any language's comment syntax carries it.
// The reason after the colon is required: a marker without one excuses
// nothing, and the finding it failed to silence is how its author finds out.
const MARKER = /rule-ignore(-file)?\s+([\w-]+)\s*:\s*\S/;

/**
 * Tells you which lines of a file a `rule-ignore` comment excuses from the
 * rule `id`, given the file's lines:
 *
 * ```ts
 * // rule-ignore no-em-dashes: quoting a spec that spells them out
 * ```
 *
 * A marker covers itself, the next line, and everything indented under that
 * line: one statement when it sits above a statement, a whole declaration
 * when it sits above one. `rule-ignore-file` covers the file instead.
 */
export function exemptions(
	lines: string[],
	id: string,
): (line: number) => boolean {
	const ranges: Array<[number, number]> = [];
	for (const [i, line] of lines.entries()) {
		const match = MARKER.exec(line);
		if (!match || match[2] !== id) {
			continue;
		}
		if (match[1]) {
			return () => true;
		}
		ranges.push([i + 1, end(lines, i)]);
	}
	return (line) => ranges.some(([from, to]) => line >= from && line <= to);
}

/** The 1-based last line a marker on 0-based `at` reaches. */
function end(lines: string[], at: number): number {
	let start = at + 1;
	while (lines[start]?.trim() === "") {
		start++;
	}
	const first = lines[start];
	if (first === undefined) {
		return at + 1;
	}
	// Indentation is counted in characters, so a block that mixes tabs and
	// spaces measures oddly. Every file a formatter has touched is consistent.
	const indent = width(first);
	let last = start;
	for (let i = start + 1; i < lines.length; i++) {
		const line = lines[i] ?? "";
		if (line.trim() === "") {
			continue;
		}
		if (width(line) <= indent) {
			break;
		}
		last = i;
	}
	return last + 1;
}

const width = (line: string): number => line.length - line.trimStart().length;
