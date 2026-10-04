import { basename } from "node:path";
import { Lang, parse } from "@ast-grep/napi";
import { Span } from "./span";
import { TypeScriptSyntax } from "./typescript-syntax";

/** One file a rule checks, with ways to look at it as text or as code. */
export class SourceFile {
	private syntax?: TypeScriptSyntax;

	constructor(
		/** From the project root. */
		readonly path: string,
		readonly text: string,
	) {}

	/** The file name up to its first dot: `cart` for `cart.test.ts`. */
	get stem(): string {
		return basename(this.path).replace(/\..*$/, "");
	}

	get lines(): string[] {
		return this.text.split("\n");
	}

	/** The file as TypeScript, parsed the first time it is asked for. */
	get ts(): TypeScriptSyntax {
		this.syntax ??= new TypeScriptSyntax(
			this,
			parse(
				this.path.endsWith(".tsx") ? Lang.Tsx : Lang.TypeScript,
				this.text,
			).root(),
		);
		return this.syntax;
	}

	/** Each match of a global pattern, at its line. */
	matches(pattern: RegExp): Span[] {
		return [...this.text.matchAll(pattern)].map(
			(match) =>
				new Span(
					this,
					this.text.slice(0, match.index).split("\n").length,
					match[0],
				),
		);
	}
}
