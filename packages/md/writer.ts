import { Markdown } from "./markdown";

/**
 * Composes a markdown document block by block: the write half of `Markdown`.
 * Fields render as frontmatter at the top no matter when they are set, so call
 * order carries no traps; everything else appends in order.
 */
export class MarkdownWriter {
	private fields = new Map<string, string>();
	private blocks: string[] = [];

	field(name: string, value: string): this {
		this.fields.set(name, value);
		return this;
	}

	heading(level: number, text: string): this {
		this.blocks.push(`${"#".repeat(level)} ${text}`);
		return this;
	}

	text(prose: string): this {
		this.blocks.push(prose);
		return this;
	}

	/** A fenced block. The fence outruns any backtick run in the code. */
	code(lang: string, code: string): this {
		const runs = code.match(/`+/g) ?? [];
		const mark = "`".repeat(Math.max(3, ...runs.map((r) => r.length + 1)));
		this.blocks.push(`${mark}${lang}\n${code}\n${mark}`);
		return this;
	}

	toString(): string {
		const front =
			this.fields.size > 0
				? ["---", ...[...this.fields].map(([k, v]) => `${k}: ${v}`), "---", ""]
				: [];
		return [...front, this.blocks.join("\n\n"), ""].join("\n");
	}

	/** The document, parsed back, handy when the caller wants accessors. */
	toMarkdown(): Markdown {
		return Markdown.parse(this.toString());
	}
}
