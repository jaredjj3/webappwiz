/** One recording and what the transcriber heard in it, kept by its id. */
export interface Take {
	id: string;
	audio: Blob;
	transcript: string;
}
