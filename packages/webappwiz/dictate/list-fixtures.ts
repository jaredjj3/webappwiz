import type { Answer } from "webappwiz/decide";
import type { DictationEdit } from "./dictation-message";
import recorded from "./list-fixtures.json";

/** A take as dictated, what a model answered about it, and its lists. */
export interface ListFixture {
	name: string;
	/** The model whose answers these are, as `webappwiz/decide` names it. */
	model: string;
	said: string;
	answers: Record<string, Answer>;
	text: string;
	edits: DictationEdit[];
}

/**
 * Dictated takes to replay through `ListFormatter`, with the answers Clef
 * and Clef Flash gave for each and what the take becomes on them, so tests
 * spend nothing. Where a model misjudges a take, `text` keeps what it makes
 * of it: the fixtures record each model as it is.
 */
export const LIST_FIXTURES = recorded as ListFixture[];
