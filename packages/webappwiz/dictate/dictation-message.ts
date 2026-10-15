/**
 * An edit a cleanup was unsure of, left for the person to judge: replacing
 * `text.slice(start, end)` of the `done` text with `#system`, which it is
 * `probability` sure of. The sure ones are already in the text.
 */
export interface DictationEdit {
	type: "tag";
	start: number;
	end: number;
	system: string;
	probability: number;
}

/** A take's final text once its cleanups ran, and the edits they left open. */
export interface Cleaned {
	text: string;
	edits: DictationEdit[];
}

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
