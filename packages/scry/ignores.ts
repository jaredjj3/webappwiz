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
		if (!/^(\/\/|#|\*|\/\*|<!--)/.test(above)) {
			return false;
		}
		if (new RegExp(`(scry|rule)-ignore ${rule}\\b`).test(above)) {
			return true;
		}
	}
	return false;
}
