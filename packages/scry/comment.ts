import { Span } from "./span";

/** A comment, and whether it is a doc comment. */
export class Comment extends Span {
	get doc(): boolean {
		return this.text.startsWith("/**");
	}
}
