import { MarkdownWriter } from "@webappwiz/md";
import type { Level } from "./diagnostic";
import type { FileText, Rule, Verdict } from "./rule/rule";

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

/** Whatever a test wants to differ from a plain rule. */
export interface TestRuleOptions {
	files?: string;
	level?: Level;
	document?: string;
	/** The whole check. Defaults to an agent-judged rule: no findings, every
	 * file escalated. */
	check?: (file: FileText) => Verdict;
}

/** A rule for tests to hand to a config, a checker or an analyzer. Its document
 * is sound unless the test hands one that is not. */
export const testRule = (id: string, opts: TestRuleOptions = {}): Rule => ({
	id,
	files: opts.files ?? "**/*.ts",
	level: opts.level ?? "error",
	document: opts.document ?? ruleDoc(id),
	check: opts.check ?? (() => ({ findings: [], escalate: true })),
});
