/**
 * Whether a comment excuses `line` of `text` from `rule`: `scry-ignore-file`
 * anywhere, or `scry-ignore` in the comment lines right above it, or the
 * same under the older `rule-ignore`. A check never asks a model about what
 * one excuses.
 */
export function ignored(text: string, rule: string, line: number): boolean {
	if (new RegExp(`(scry|rule)-ignore-file ${rule}\\b`).test(text)) {
		return true;
	}
	const lines = text.split("\n");
	for (let at = line - 2; at >= 0; at--) {
		const above = lines[at]?.trim() ?? "";
		if (!COMMENT.test(above)) {
			return false;
		}
		if (new RegExp(`(scry|rule)-ignore ${rule}\\b`).test(above)) {
			return true;
		}
	}
	return false;
}

/**
 * Whether `text` still excuses itself from one of `rules` with the older
 * `rule-ignore` or `rule-ignore-file`, which counts but should be renamed.
 */
export function legacy(text: string, rules: string[]): boolean {
	if (rules.length === 0) {
		return false;
	}
	// only a comment naming a rule: code and prose may mention the spelling
	const directive = new RegExp(`rule-ignore(-file)? (${rules.join("|")})\\b`);
	return text
		.split("\n")
		.some((line) => COMMENT.test(line.trim()) && directive.test(line));
}

const COMMENT = /^(\/\/|#|\*|\/\*|<!--)/;
