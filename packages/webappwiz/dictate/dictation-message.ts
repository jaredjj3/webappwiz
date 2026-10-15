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
	/** The take's final text, after "finish", and the edits left open on it. */
	| { type: "done"; text: string; edits: DictationEdit[] };

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
	  };

/** A take's final text once its cleanups ran, and the edits they left open. */
export interface Cleaned {
	text: string;
	edits: DictationEdit[];
}
