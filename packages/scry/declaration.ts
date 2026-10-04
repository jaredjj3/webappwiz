import type { SourceFile } from "./source-file";
import { Span } from "./span";

/** A named declaration: a class, a function. */
export class Declaration extends Span {
	constructor(
		file: SourceFile,
		line: number,
		text: string,
		readonly name: string,
	) {
		super(file, line, text);
	}
}
