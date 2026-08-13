import { Hit } from "../hit";
import { SyntaxKind, type Token, tokens } from "../scan";
import doc from "./objects-over-callbacks.md" with { type: "text" };
import type { PartlyChecked } from "./rule";

export class ObjectsOverCallbacks implements PartlyChecked {
	private static readonly MESSAGE =
		"constructor takes a function-typed parameter: name an interface and " +
		"inject an object, or expose Events from @webappwiz/events";

	readonly id = "objects-over-callbacks";
	readonly files = "**/*.ts";
	readonly level = "warning";
	readonly checkedBy = "code-then-agent";
	readonly document = doc;
	// The check sees function types in constructor parameters, where retention
	// is certain. Method parameters that keep a callback still need the agent.

	check(text: string): Hit[] {
		const all = tokens(text);
		const found: Hit[] = [];
		for (const [i, token] of all.entries()) {
			if (
				token.kind !== SyntaxKind.ConstructorKeyword ||
				all[i + 1]?.kind !== SyntaxKind.OpenParenToken
			) {
				continue;
			}
			if (this.takesFunction(all, i + 1)) {
				found.push(
					new Hit(token.line, token.column, ObjectsOverCallbacks.MESSAGE),
				);
			}
		}
		return found;
	}

	/** Whether the parameter list opening at token `at` holds a function type,
	 * as an annotation or a default value. */
	private takesFunction(all: Token[], at: number): boolean {
		let parens = 0;
		for (let i = at; i < all.length; i++) {
			const kind = all[i]?.kind;
			if (kind === SyntaxKind.OpenParenToken) {
				parens++;
			} else if (kind === SyntaxKind.CloseParenToken && --parens === 0) {
				return false;
			} else if (kind === SyntaxKind.EqualsGreaterThanToken) {
				return true;
			}
		}
		return false;
	}
}
