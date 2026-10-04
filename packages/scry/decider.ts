import type { Span } from "./source-file";

/**
 * Answers a yes-or-no question about a place in a file with the probability
 * of yes. A decision model, usually; but a word list or a heuristic could
 * answer too, and a rule would not know the difference.
 *
 * The question is about `about`, and is answered with its whole file in
 * view, so a model reads the code around it the way a reviewer would.
 */
export interface Decider {
	decide(question: string, about: Span): Promise<number>;
}

/** What a decision model is told a question is about. */
export function pointing(question: string, about: Span): string {
	const last = about.line + about.text.split("\n").length - 1;
	const where =
		last === about.line
			? `line ${about.line}`
			: `lines ${about.line} to ${last}`;
	return `About ${where} of \`file\`: ${question}`;
}

/** The state a decision model reads: the file, with its lines numbered. */
export function state(about: Span): Record<string, unknown> {
	return {
		path: about.file.path,
		file: about.file.lines
			.map((line, index) => `${index + 1}  ${line}`)
			.join("\n"),
	};
}
