import type { Finding } from "./rule";
import type { SourceFile } from "./source-file";

/** A stretch of a file a finding can point at. */
export class Span {
	constructor(
		readonly file: SourceFile,
		/** Where it starts, from 1. */
		readonly line: number,
		readonly text: string,
	) {}

	/** The span and the lines after it, for a decider to read. */
	withNext(count: number): string {
		const last = this.line - 1 + this.text.split("\n").length + count;
		return this.file.lines.slice(this.line - 1, last).join("\n");
	}

	flag(message: string, confidence = 1, decidedBy?: string): Finding {
		return {
			line: this.line,
			message,
			confidence,
			...(decidedBy === undefined ? {} : { decidedBy }),
		};
	}
}
