import type { Decider, Question } from "webappwiz/decide";
import type { Cleaned, DictationEdit } from "./dictation-message";
import type { Cleanup } from "./dictation-relay";

/**
 * How sure a sentence must be missing a word to be flagged. A flag changes
 * nothing, so there is no band above it that applies.
 */
export const MISSING_THRESHOLDS = { flag: 0.6 } as const;

/** The fewest words a sentence needs for a model to tell one is missing. */
const SHORTEST = 4;

/**
 * A {@link Cleanup} that flags a sentence which seems to be missing a word,
 * as transcription often loses one ("push the fix staging"). A model can
 * judge that a word is gone but cannot say which, so the text stays as it
 * is and the sentence gets a `type: "missing"` edit for the person to
 * look at. It asks one Noul per sentence, all in one request, and nothing of
 * a take with no sentence long enough to judge.
 */
export class MissingWordFlagger implements Cleanup {
	readonly kind = "missing";

	constructor(private readonly decider: Decider) {}

	async clean(text: string): Promise<Cleaned> {
		const sentences = sentencesOf(text).filter(
			(sentence) => words(text.slice(sentence.start, sentence.end)) >= SHORTEST,
		);
		if (sentences.length === 0) {
			return { text, edits: [] };
		}
		const { answers } = await this.decider.decide(
			text,
			Object.fromEntries(
				sentences.map((sentence, index) => [
					`missing.${index}`,
					question(text.slice(sentence.start, sentence.end)),
				]),
			),
		);
		const edits: DictationEdit[] = [];
		sentences.forEach((sentence, index) => {
			const answer = answers[`missing.${index}`];
			const probability = answer?.type === "noul" ? answer.noul : 0;
			if (probability > MISSING_THRESHOLDS.flag) {
				edits.push({ type: "missing", ...sentence, probability });
			}
		});
		return { text, edits };
	}
}

/** Each sentence of `text`, without the space round it, as `[start, end)`. */
function sentencesOf(text: string): { start: number; end: number }[] {
	return [...text.matchAll(/[^.!?\n]*[^\s.!?][^.!?\n]*[.!?]*/gu)].map(
		(match) => {
			const lead = match[0].length - match[0].trimStart().length;
			return {
				start: match.index + lead,
				end: match.index + match[0].trimEnd().length,
			};
		},
	);
}

function words(sentence: string): number {
	return sentence.split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word))
		.length;
}

/** A Noul on whether `sentence` seems to be missing a word. */
function question(sentence: string): Question {
	return {
		type: "noul",
		instructions: `Does the sentence "${sentence}" seem to be missing a word?`,
		criteria: {
			true: 'A word the grammar needs is gone, as a speech transcript loses them: a preposition ("push the fix staging"), an article, a verb or a pronoun the sentence cannot do without.',
			false:
				"It reads whole as spoken, even if casual, clipped or a fragment, such as a list item, a command or a short reply; or it only names code, files or tools.",
		},
	};
}
