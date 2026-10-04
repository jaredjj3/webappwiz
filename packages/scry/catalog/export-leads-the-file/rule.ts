import type { Finding, Rule, SourceFile, SyntaxNode } from "@webappwiz/scry";

/** How many lines a reader sees on opening a file, in an editor of the usual height. */
const SCREEN = 50;

/** A line of a comment. */
const COMMENT = /^\s*(\/\/|\/\*|\*)/;

/** What a helper is declared as, at the top of a file. */
const HELPERS = [
	"function_declaration",
	"class_declaration",
	"abstract_class_declaration",
];

/** What a helper is, when it is a `const` holding one. */
const HELPER_VALUES = ["arrow_function", "function_expression", "class"];

/**
 * Finds a helper class or function above the export a file is named for, and
 * that export starting below the first screen.
 */
export default class ExportLeadsTheFile implements Rule {
	async check(file: SourceFile): Promise<Finding[]> {
		const statements = file.ts.topLevel();
		const lead = this.leadingExport(file, statements);
		if (lead === undefined) {
			return [];
		}
		const name = nameOf(lead);
		const above = statements.filter((statement) => statement.line < lead.line);
		return [
			...above
				.filter((statement) => this.isHelper(statement))
				.map((helper) =>
					helper.flag(
						`Move ${nameOf(helper)} below ${name}, or make it a private method of it.`,
					),
				),
			...(this.start(file, lead) > SCREEN
				? [
						lead.flag(
							`Bring ${name} onto the first screen: it starts on line ${this.start(file, lead)}.`,
						),
					]
				: []),
		];
	}

	/**
	 * The export named like the file, `RateLimiter` in `rate-limiter.ts`;
	 * else the first exported class or function. None in a file of
	 * re-exports.
	 */
	private leadingExport(
		file: SourceFile,
		statements: SyntaxNode[],
	): SyntaxNode | undefined {
		const exported = statements.filter((statement) =>
			statement.parent()?.is("export_statement"),
		);
		const stem = squash(file.stem);
		return (
			exported.find((statement) => squash(nameOf(statement)) === stem) ??
			exported.find((statement) => HELPERS.includes(statement.kind))
		);
	}

	/** Where a reader meets the export: at its doc comment, when it has one. */
	private start(file: SourceFile, lead: SyntaxNode): number {
		let line =
			(lead.parent()?.is("export_statement") ? lead.parent() : lead)?.line ??
			lead.line;
		while (line > 1 && COMMENT.test(file.lines[line - 2] ?? "")) {
			line--;
		}
		return line;
	}

	/** A class or function nobody imports, whatever it is declared with. */
	private isHelper(statement: SyntaxNode): boolean {
		if (statement.parent()?.is("export_statement")) {
			return false;
		}
		if (HELPERS.includes(statement.kind)) {
			return true;
		}
		return (
			statement.is("lexical_declaration") &&
			statement
				.children()
				.some((declarator) =>
					HELPER_VALUES.includes(declarator.field("value")?.kind ?? ""),
				)
		);
	}
}

/** What a declaration declares: a class's or function's name, a `const`'s first. */
function nameOf(statement: SyntaxNode): string {
	return (
		statement.field("name")?.text ??
		statement
			.children()
			.find((child) => child.is("variable_declarator"))
			?.field("name")?.text ??
		"it"
	);
}

/** A name with its case and punctuation dropped, to compare across conventions. */
function squash(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
