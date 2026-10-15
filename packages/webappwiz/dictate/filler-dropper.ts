import type { Decider, Question } from "webappwiz/decide";
import type { Cleaned } from "./dictation-message";
import type { Cleanup } from "./dictation-relay";
import { applyDrops, type Drop, startsSentence } from "./drops";

/**
 * How sure a word must be filler to drop (`apply`), and below which it is
 * never offered (`leave`); one in between stays, with an edit to drop it.
 */
export const FILLER_THRESHOLDS = { apply: 0.8, leave: 0.3 } as const;

/** Sounds that are filler wherever they are said, so none is asked about. */
const SOUNDS = /^(?:u+m+|u+h+|e+r+m+|h+m+)$/iu;

/** Words that are filler only sometimes, and the sounds that always are. */
const FILLER =
	/\b(?:like|kind of|sort of|you know|i mean|so|u+m+|u+h+|e+r+m+|h+m+)\b/giu;

/**
 * A {@link Cleanup} that drops the filler words a take's speaker said, with
 * the commas around them: "um" and "uh" always, and "like", "kind of",
 * "sort of", "you know", "I mean" and "so" where the decider, asked once per
 * take, says they carry no meaning ("tired like a dog" keeps its "like").
 * It asks nothing of a take with no such word.
 */
export class FillerDropper implements Cleanup {
	constructor(private readonly decider: Decider) {}

	async clean(text: string): Promise<Cleaned> {
		const found = [...text.matchAll(FILLER)].map((match) => ({
			start: match.index,
			end: match.index + match[0].length,
			sound: SOUNDS.test(match[0]),
		}));
		const asked = found.filter((word) => !word.sound);
		const answers =
			asked.length === 0
				? {}
				: (
						await this.decider.decide(
							text,
							Object.fromEntries(
								asked.map((word, index) => [
									`filler.${index}`,
									question(text, word.start, word.end),
								]),
							),
						)
					).answers;
		// Each sure drop is made on the text the ones before it left, so two
		// that share a comma both come out right. A drop only moves what lies
		// after it, so each word is found by how much the text shrank so far.
		let left = text;
		const unsure: Word[] = [];
		let index = 0;
		for (const word of found) {
			const answer = word.sound ? undefined : answers[`filler.${index++}`];
			const probability = word.sound
				? 1
				: answer?.type === "noul"
					? answer.noul
					: 0;
			const shift = left.length - text.length;
			const start = word.start + shift;
			const end = word.end + shift;
			if (probability > FILLER_THRESHOLDS.apply) {
				const drop = dropOf(left, start, end, probability);
				left = applyDrops(left, [drop], FILLER_THRESHOLDS, "filler").text;
			} else {
				unsure.push({ start, end, probability });
			}
		}
		// The unsure ones' spans are found on the text left, since a sure
		// drop may have taken a comma one leaned on.
		return applyDrops(
			left,
			unsure.map((word) =>
				dropOf(left, word.start, word.end, word.probability),
			),
			FILLER_THRESHOLDS,
			"filler",
		);
	}
}

/** A filler word at `[start, end)`, and how sure it is filler. */
interface Word {
	start: number;
	end: number;
	probability: number;
}

/** A Noul on whether the word at `[start, end)` is filler, in its sentence. */
function question(text: string, start: number, end: number): Question {
	const from = text.slice(0, start).search(/[^.!?]*$/u);
	const stop = text.slice(end).search(/[.!?](?:\s|$)/u);
	const to = stop < 0 ? text.length : end + stop + 1;
	const sentence = `${text.slice(from, start)}[${text.slice(start, end)}]${text.slice(end, to)}`;
	return {
		type: "noul",
		instructions: `Is the bracketed "${text.slice(start, end)}" in "${sentence.trim()}" filler, which the sentence says the same without?`,
		criteria: {
			true: "It is filler: a pause or hedge the speaker would not write, and dropping it changes nothing the sentence says.",
			false:
				'It carries meaning: a verb, a comparison ("tired like a dog"), a degree ("kind of red"), a consequence ("so we left"), or what a question asks.',
		},
	};
}

/**
 * The drop of the word at `[start, end)` with the punctuation it leaves
 * behind: both commas round it, or the one before or after, or the space
 * after it, capitalizing what follows when it opened a sentence.
 */
function dropOf(
	text: string,
	start: number,
	end: number,
	probability: number,
): Drop {
	const before = /,\s*$/u.exec(text.slice(0, start));
	const after = /^,?\s*/u.exec(text.slice(end))?.[0] ?? "";
	if (startsSentence(text, start)) {
		// A sentence of filler alone goes with its full stop.
		const alone = /^[,]?\s*[.!?](?:\s+|$)/u.exec(text.slice(end));
		return {
			start,
			end: end + (alone?.[0].length ?? after.length),
			capital: true,
			probability,
		};
	}
	if (before !== null) {
		// The comma before goes, and the one after too when it closes an aside.
		const to = after.startsWith(",") ? end + 1 : end;
		return { start: before.index, end: to, capital: false, probability };
	}
	if (/^,?\s+[^\s.!?;:]/u.test(text.slice(end))) {
		return { start, end: end + after.length, capital: false, probability };
	}
	// Last before a stop, the space before it goes instead.
	const space = /\s*$/u.exec(text.slice(0, start))?.[0].length ?? 0;
	return { start: start - space, end, capital: false, probability };
}
