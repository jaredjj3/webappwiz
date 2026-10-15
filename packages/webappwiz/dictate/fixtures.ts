import type { Answer } from "webappwiz/decide";
import correctionsRecorded from "./correction-fixtures.json";
import type { DictationEdit } from "./dictation-message";
import fillerRecorded from "./filler-fixtures.json";
import listsRecorded from "./list-fixtures.json";
import missingRecorded from "./missing-fixtures.json";

/** A take as dictated, what a model answered about it, and what it becomes. */
export interface CleanupFixture {
	name: string;
	/** The model whose answers these are, as `webappwiz/decide` names it. */
	model: string;
	said: string;
	answers: Record<string, Answer>;
	text: string;
	edits: DictationEdit[];
}

/*
 * Dictated takes to replay through a cleanup, with the answers Clef and Clef
 * Flash gave for each and what the take becomes on them, so tests spend
 * nothing. Where a model misjudges a take, `text` keeps what it makes of it:
 * the fixtures record each model as it is.
 */

/** Takes for `ListFormatter`. */
export const LIST_FIXTURES = listsRecorded as CleanupFixture[];

/** Takes for `CorrectionDropper`. */
export const CORRECTION_FIXTURES = correctionsRecorded as CleanupFixture[];

/** Takes for `FillerDropper`. */
export const FILLER_FIXTURES = fillerRecorded as CleanupFixture[];

/** Takes for `MissingWordFlagger`. */
export const MISSING_FIXTURES = missingRecorded as CleanupFixture[];
