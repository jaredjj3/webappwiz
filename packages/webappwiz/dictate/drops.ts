import type { Cleaned, DictationEdit } from "./dictation-message";

/** Words a cleanup may drop, `text.slice(start, end)`. */
export interface Drop {
	start: number;
	end: number;
	/** Whether the words open a sentence, so what follows them is capitalized. */
	capital: boolean;
	/** How sure the cleanup is that the words should go. */
	probability: number;
}

/** How sure a drop must be to apply, and below which it is never offered. */
export interface DropThresholds {
	apply: number;
	leave: number;
}

/**
 * `text` with each drop above `thresholds.apply` made, those that overlap
 * merged into one, and an edit of `type` for each one in between that
 * touches none made, keeping the likelier of two that touch.
 */
export function applyDrops(
	text: string,
	drops: Drop[],
	thresholds: DropThresholds,
	type: "correction" | "filler",
): Cleaned {
	const sorted = [...drops].sort((one, other) => one.start - other.start);
	const sure: Drop[] = [];
	for (const drop of sorted.filter(
		(each) => each.probability > thresholds.apply,
	)) {
		const last = sure.at(-1);
		if (last !== undefined && drop.start <= last.end) {
			sure[sure.length - 1] = { ...last, end: Math.max(last.end, drop.end) };
		} else {
			sure.push(drop);
		}
	}
	// Touching counts, since a drop may take the letter after it.
	const overlaps = (one: Drop, other: Drop) =>
		one.start <= other.end && other.start <= one.end;
	const offered: Drop[] = [];
	for (const drop of sorted) {
		if (
			drop.probability > thresholds.apply ||
			drop.probability < thresholds.leave ||
			sure.some((each) => overlaps(each, drop))
		) {
			continue;
		}
		const rival = offered.findIndex((each) => overlaps(each, drop));
		if (rival < 0) {
			offered.push(drop);
		} else if (drop.probability > (offered[rival]?.probability ?? 0)) {
			offered[rival] = drop;
		}
	}
	let out = "";
	let from = 0;
	const edits: DictationEdit[] = [];
	for (const drop of [...sure, ...offered].sort(
		(one, other) => one.start - other.start,
	)) {
		out += text.slice(from, drop.start);
		from = drop.start;
		// A capital takes the place of the letter after the span.
		const next = text.charAt(drop.end);
		const capital = drop.capital && /\p{Ll}/u.test(next);
		const end = drop.end + (capital ? 1 : 0);
		const replacement = capital ? next.toUpperCase() : "";
		if (drop.probability > thresholds.apply) {
			out += replacement;
			from = end;
			continue;
		}
		edits.push({
			type,
			start: out.length,
			end: out.length + end - drop.start,
			text: replacement,
			probability: drop.probability,
		});
	}
	return { text: out + text.slice(from), edits };
}

/**
 * Whether `at` begins a sentence of `text`: nothing but space before it, or
 * a sentence end.
 */
export function startsSentence(text: string, at: number): boolean {
	return /(?:^|[.!?:]\s)\s*$/u.test(text.slice(0, at));
}
