import { MarkdownWriter } from "@webappwiz/md";

/** A sound rule document for tests to compile, break, or point guides at. */
export const ruleDoc = (
	name: string,
	files = "**/*.ts",
	level = "error",
): string =>
	new MarkdownWriter()
		.field("files", files)
		.field("level", level)
		.heading(1, name)
		.text(`Prose about ${name}.`)
		.heading(2, "Good")
		.code("ts", "class Foo {}")
		.heading(2, "Bad")
		.code("ts", "class Foo {}\nclass Bar {}")
		.toString();
