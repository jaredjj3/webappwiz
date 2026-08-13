import { MarkdownWriter } from "@webappwiz/md";
import type { Rule } from "./rule";

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

/** A rule for tests to hand to a task. Its document is sound unless the test
 * hands one that is not. */
export const testRule = (id: string, document = ruleDoc(id)): Rule => ({
	id,
	document,
});
