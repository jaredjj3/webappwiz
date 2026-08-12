import { MarkdownWriter } from "@webappwiz/md";
import type { Level } from "./diagnostic";
import type { Finding } from "./finding";
import type { Rule } from "./rule/rule";

/** A sound rule document for tests to point a rule at, or to break. */
export const ruleDoc = (name: string): string =>
	new MarkdownWriter()
		.heading(1, name)
		.text(`Prose about ${name}.`)
		.heading(2, "Good")
		.code("ts", "class Foo {}")
		.heading(2, "Bad")
		.code("ts", "class Foo {}\nclass Bar {}")
		.toString();

/** A rule for tests to hand to a guide, a linter or an analyzer. Its document
 * is sound unless the test hands one that is not. */
export const testRule = (
	id: string,
	opts: {
		files?: string;
		level?: Level;
		document?: string;
		check?: (text: string) => Finding[];
		partial?: boolean;
	} = {},
): Rule => ({
	id,
	files: opts.files ?? "**/*.ts",
	level: opts.level ?? "error",
	document: opts.document ?? ruleDoc(id),
	check: opts.check,
	partial: opts.partial,
});
