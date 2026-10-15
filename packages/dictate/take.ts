/** One recording and what the transcriber heard in it, kept by its id. */
export interface Take {
	id: string;
	audio: Blob;
	transcript: string;
}

/** What the page sees of a take: everything but the audio, which it fetches by id. */
export interface TakeSummary {
	id: string;
	transcript: string;
}

export function summary(take: Take): TakeSummary {
	return { id: take.id, transcript: take.transcript };
}
