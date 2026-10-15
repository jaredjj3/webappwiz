import type { Answer, Decider, Question } from "webappwiz/decide";
import type { Cleaned } from "./dictation-message";
import type { Cleanup } from "./dictation-relay";
import { applyDrops, type Drop, startsSentence } from "./drops";

/**
 * How sure a correction must be to drop what it takes back (`apply`), and
 * below which it is never offered (`leave`); one in between stays, with an
 * edit to drop it.
 */
export const CORRECTION_THRESHOLDS = { apply: 0.9, leave: 0.3 } as const;

/** What a segment opening with a cue can do to the segment before it. */
const ROLES = {
	replaces:
		"It takes back the segment before it whole: what follows the cue, if anything, is said instead of it.",
	amends:
		"It takes back only the last words of the segment before it, such as a number, a name or a word: what follows the cue is said in their place.",
	neither:
		"It takes nothing back: the cue word is part of what is said, as in an answer, an aside or an emphasis.",
};

/** Cue words that open a correction only before punctuation or another cue. */
const BARE_CUES = "no|nope|wait|sorry|actually";

/** Cue phrases that open a correction wherever they are said. */
const PHRASE_CUES =
	"i mean|scratch that|never\\s?mind|or rather|let me rephrase";

/** A cue that may open a correction, so "no one" is no cue. */
const CUE_WORD = `(?:(?:${BARE_CUES})(?=[,.!:;]|\\s+(?:${BARE_CUES}|${PHRASE_CUES})\\b)|${PHRASE_CUES})`;

/** A run of cue words opening a segment, with the punctuation after each. */
const LEADING_CUE = new RegExp(`^(?:${CUE_WORD}[,.!:;]?(?:\\s+|$))+`, "iu");

/**
 * Where one segment ends: a sentence end, or a comma before a cue but for
 * one after a cue, so "actually, no, send it" is one segment.
 */
const BOUNDARY = new RegExp(
	`[.!?](?=\\s+\\S)|(?<!\\b(?:${BARE_CUES}|${PHRASE_CUES})),(?=\\s+${CUE_WORD})`,
	"giu",
);

/** A run of the text, `[start, end)`, its punctuation included. */
interface Segment {
	start: number;
	end: number;
}

/**
 * A {@link Cleanup} that drops what a take's speaker took back: a sentence
 * or clause after which another opens with "no", "wait", "I mean",
 * "actually" or "scratch that" and says it again, or retracts it. Code
 * finds the segments a cue opens, the decider says in one request what each
 * does to the one before, and code drops the words taken back with the cue,
 * keeping the newer wording. It asks nothing of a take with no cue.
 */
export class CorrectionDropper implements Cleanup {
	readonly kind = "correction";

	constructor(private readonly decider: Decider) {}

	async clean(text: string): Promise<Cleaned> {
		const segments = segmentsOf(text);
		const cued = segments
			.map((segment, index) => ({ segment, index }))
			// A question is answered, never corrected: "Did it pass? No, …".
			.filter(
				({ index, segment }) =>
					index > 0 &&
					cueOf(text, segment) > 0 &&
					!slice(text, segments[index - 1] ?? segment).endsWith("?"),
			);
		if (cued.length === 0) {
			return { text, edits: [] };
		}
		const { answers } = await this.decider.decide(
			segments
				.map((segment, index) => `S${index}| ${slice(text, segment)}`)
				.join("\n"),
			questions(cued.map(({ index }) => index)),
		);
		const drops = cued.flatMap(({ index, segment }) => {
			const before = segments[index - 1];
			const drop =
				before === undefined
					? undefined
					: dropOf(
							text,
							before,
							segment,
							segments[index + 1],
							answers[`correction.${index}`],
						);
			return drop === undefined ? [] : [drop];
		});
		return applyDrops(text, drops, CORRECTION_THRESHOLDS, "correction");
	}
}

function segmentsOf(text: string): Segment[] {
	const segments: Segment[] = [];
	let start = text.search(/\S/);
	if (start < 0) {
		return segments;
	}
	for (const match of text.matchAll(BOUNDARY)) {
		const end = match.index + 1;
		segments.push({ start, end });
		start = end + text.slice(end).search(/\S/);
	}
	segments.push({ start, end: text.trimEnd().length });
	return segments;
}

/** How many characters of `segment` its leading cue takes, 0 for none. */
function cueOf(text: string, segment: Segment): number {
	return LEADING_CUE.exec(slice(text, segment))?.[0].length ?? 0;
}

/** A Choice on what each cued segment does to the one before it. */
function questions(indexes: number[]): Record<string, Question> {
	return Object.fromEntries(
		indexes.map((index) => [
			`correction.${index}`,
			{
				type: "choice",
				instructions: `Segment S${index} opens with a word that can take back what was just said. What does it do to segment S${index - 1}?`,
				criteria: ROLES,
			} satisfies Question,
		]),
	);
}

/**
 * What `segment` drops, as `answer` judges it: the segment `before` it, or
 * its last words, and the cue, up to the newer wording, or up to the
 * segment `after` when it says nothing past its cue.
 */
function dropOf(
	text: string,
	before: Segment,
	segment: Segment,
	after: Segment | undefined,
	answer: Answer | undefined,
): Drop | undefined {
	const probabilities = answer?.type === "choice" ? answer.probabilities : {};
	const replaces = probabilities.replaces ?? 0;
	const amends = probabilities.amends ?? 0;
	const probability = replaces + amends;
	let newer = segment.start + cueOf(text, segment);
	const rest = text.slice(newer, segment.end);
	if (/^[\s,.!?:;]*$/u.test(rest)) {
		// Nothing past the cue: the whole segment goes with what it retracts.
		if (after === undefined) {
			const start = text.slice(0, before.start).trimEnd().length;
			return { start, end: segment.end, capital: false, probability };
		}
		newer = after.start;
	} else if (amends > replaces || few(text, before, rest)) {
		const start = amendedFrom(text, before, rest);
		if (start > before.start) {
			return { start, end: newer, capital: false, probability };
		}
	}
	return {
		start: before.start,
		end: newer,
		capital: startsSentence(text, before.start),
		probability,
	};
}

/**
 * Whether `newer`, up to its first comma or stop, has under half the words
 * of `before`: too few to say all of it again, so it can only amend it.
 */
function few(text: string, before: Segment, newer: string): boolean {
	return (
		2 * wordsOf(firstClause(newer)).length < wordsOf(slice(text, before)).length
	);
}

/**
 * Where in `before` the words that `newer` says again start: at the last
 * word of `before` that `newer` opens with, or else as many words from its
 * end as `newer` has up to its first comma or stop.
 */
function amendedFrom(text: string, before: Segment, newer: string): number {
	const words = wordsOf(slice(text, before));
	const said = wordsOf(firstClause(newer));
	const opening = said[0]?.[0].toLowerCase();
	const again = words.findLastIndex(
		(word) => word[0].toLowerCase() === opening,
	);
	const from = again >= 0 ? again : Math.max(0, words.length - said.length);
	return before.start + (words[from]?.index ?? 0);
}

function wordsOf(said: string): RegExpExecArray[] {
	return [...said.matchAll(/[\p{L}\p{N}'’]+/gu)];
}

/** `said` up to its first comma or stop. */
function firstClause(said: string): string {
	return said.split(/[,;:.!?]/u)[0] ?? "";
}

function slice(text: string, segment: Segment): string {
	return text.slice(segment.start, segment.end);
}
