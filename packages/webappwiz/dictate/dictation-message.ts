/**
 * What the server says on a dictation's socket, as JSON text. The page sends
 * the take's audio as bytes, PCM16 at `SAMPLE_RATE`, then "finish" as text.
 */
export type DictationMessage =
	/** All the take's text so far, rough until it is done. */
	| { type: "heard"; text: string }
	/**
	 * Why the take broke off; `cred` names the cred it needs, which the Creds
	 * page now asks for.
	 */
	| { type: "failed"; message: string; cred?: string }
	/** The take, after "finish", as {@link DictatedTake} says. */
	| ({ type: "done" } & DictatedTake);

/**
 * A take's final text with what its cleanups did, so a person can judge it
 * against what was said.
 */
export interface DictatedTake {
	/** The text once the sure edits are applied. */
	text: string;
	/** The text as the transcription heard it, before any cleanup. */
	said: string;
	/** The edits already in `text`, each spanning what it left there. */
	applied: AppliedEdit[];
	/** The edits left open on `text`, each spanning the words it would change. */
	edits: DictationEdit[];
	/** What each cleanup asked its model, and what it cost. */
	decisions: DictationDecision[];
}

/** Which cleanup an edit came from. */
export type EditKind = DictationEdit["type"];

/**
 * An edit a cleanup was sure of and made, spanning `text.slice(start, end)`
 * of the `done` text, where it left the new words, if any. Putting `was`
 * back in its place undoes it.
 */
export interface AppliedEdit {
	type: EditKind;
	start: number;
	end: number;
	/** The words the edit replaced, empty when it only added. */
	was: string;
}

/** One request a cleanup made of its model, with what it asked and what came back. */
export interface DictationDecision {
	cleanup: EditKind;
	/** The model that answered, as asked for. */
	model: string;
	/** What the cleanup showed the model of the text. */
	state: string;
	questions: {
		id: string;
		instructions: string;
		/** The answer in words, such as `0.82` or `item 0.7, prose 0.2`. */
		answer: string;
	}[];
	latencyMs: number;
	inputTokens: number;
	outputTokens: number;
	dollars: number;
}

/**
 * An edit a cleanup was unsure of, left for the person to judge, spanning
 * `text.slice(start, end)` of the `done` text. The sure ones are already in
 * the text.
 */
export type DictationEdit =
	/** Replacing the span with `#system`, which it is `probability` sure of. */
	| {
			type: "tag";
			start: number;
			end: number;
			system: string;
			probability: number;
	  }
	/**
	 * Starting a new list item where the span sits, by replacing it with
	 * `text` (a line break, the item's marker and its first letter), which it
	 * is `probability` sure of.
	 */
	| {
			type: "item";
			start: number;
			end: number;
			text: string;
			probability: number;
	  }
	/**
	 * Dropping words a later sentence or clause took back, with the cue that
	 * took them back, by replacing the span with `text` (empty, or the first
	 * letter of what follows, capitalized), which it is `probability` sure of.
	 */
	| {
			type: "correction";
			start: number;
			end: number;
			text: string;
			probability: number;
	  }
	/**
	 * Dropping a filler word with the punctuation around it, by replacing the
	 * span with `text` (empty, or the first letter of what follows,
	 * capitalized), which it is `probability` sure of.
	 */
	| {
			type: "filler";
			start: number;
			end: number;
			text: string;
			probability: number;
	  }
	/**
	 * Flagging the span, a sentence that seems to be missing a word, which it
	 * is `probability` sure of. It replaces nothing: a model can tell a word
	 * is gone but not which.
	 */
	| { type: "missing"; start: number; end: number; probability: number };

/** A take's final text once its cleanups ran, and the edits they left open. */
export interface Cleaned {
	text: string;
	edits: DictationEdit[];
	/** What a {@link CleanupSequence} made of the text it was given. */
	applied?: AppliedEdit[];
	/** What the cleanups asked their models, when someone recorded it. */
	decisions?: DictationDecision[];
}
