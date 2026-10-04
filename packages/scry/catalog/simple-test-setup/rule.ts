import type {
	Decider,
	Finding,
	Rule,
	SourceFile,
	SyntaxNode,
	Tools,
} from "@webappwiz/scry";

/** The functions that declare a test, as bun, vitest and jest name them. */
const TESTS = new Set(["it", "test"]);

const LOOPS = [
	"for_statement",
	"for_in_statement",
	"while_statement",
	"do_statement",
];

/** Array methods that run a callback once per element. */
const ITERATORS = new Set(["forEach", "map", "flatMap"]);

/** Words that put a condition, not a behavior, at the front of a title. */
const CONDITIONS = new Set(["when", "if", "given", "after", "with", "on"]);

/** How many declarations a test makes before it reads as mostly setup. */
const SETUP_DECLARATIONS = 3;

const ACTION_FIRST =
	'Does this test title lead with the action or method under test instead of the behavior, so that "it" followed by the title does not read as a sentence?';

const DROWNED =
	"Does the setup in this test bury the one behavior it checks, so a reader has to wade through construction details to find what is under test?";

/**
 * Finds a test file that is hard to read top to bottom: more than one
 * describe, tests a loop makes, titles that lead with the action, and
 * tests drowned in setup.
 */
export default class SimpleTestSetup implements Rule {
	static readonly description =
		"One describe per file, it titles that complete the sentence, shared setup in its beforeEach.";
	static readonly files = "**/*.test.ts";
	static readonly level = "error";
	static readonly recommended = true;

	private decider: Decider;

	constructor(tools: Tools) {
		this.decider = tools.decider;
	}

	async check(file: SourceFile): Promise<Finding[]> {
		return [
			...this.extraDescribes(file),
			...this.testsALoopMakes(file),
			...(await this.titlesLeadingWithTheAction(file)),
			...(await this.setupDrowningTheBehavior(file)),
		].toSorted((left, right) => left.line - right.line);
	}

	/** Every `describe` after the first, nested or side by side. */
	private extraDescribes(file: SourceFile): Finding[] {
		return this.calls(file, new Set(["describe"]))
			.slice(1)
			.map((describe) =>
				describe.flag(
					"Make one describe per file: fold this one into the first, or move its tests to a file of their own.",
				),
			);
	}

	/** A loop, or a callback per element, that declares tests. */
	private testsALoopMakes(file: SourceFile): Finding[] {
		const loops = file.ts.findAll({
			rule: {
				any: [
					...LOOPS.map((kind) => ({ kind })),
					{
						kind: "call_expression",
						has: {
							field: "function",
							kind: "member_expression",
							has: {
								field: "property",
								regex: `^(${[...ITERATORS].join("|")})$`,
							},
						},
					},
				],
			},
		});
		const tests = this.calls(file, TESTS);
		return loops
			.filter((loop) =>
				tests.some((test) => test.line >= loop.line && test.end <= loop.end),
			)
			.filter(
				(loop) =>
					!loops.some(
						(outer) =>
							outer !== loop &&
							outer.line <= loop.line &&
							outer.end >= loop.end,
					),
			)
			.map((loop) =>
				loop.flag(
					"Write each test out on its own, so a reader can follow it without running the loop in their head.",
				),
			);
	}

	/**
	 * Titles that may not complete "it ...": ones that open on a gerund like
	 * "calling", on a name from the code like `isEnabled`, or on a condition.
	 * A decider reads each one.
	 */
	private async titlesLeadingWithTheAction(
		file: SourceFile,
	): Promise<Finding[]> {
		const candidates = this.calls(file, TESTS).flatMap((test) => {
			const title = test.field("arguments")?.children()[0];
			return title?.is("string", "template_string") &&
				leadsWithTheAction(title.text.slice(1, -1))
				? [title]
				: [];
		});
		return Promise.all(
			candidates.map(async (title) =>
				title.flag(
					`Lead with the behavior, so the title completes "it ...": ${title.text}.`,
					await this.decider.decide(ACTION_FIRST, title),
					ACTION_FIRST,
				),
			),
		);
	}

	/** Tests that declare several things before they act, which a decider weighs. */
	private async setupDrowningTheBehavior(file: SourceFile): Promise<Finding[]> {
		const candidates = file.ts
			.tests()
			.filter(
				(test) =>
					(test.field("body")?.children() ?? []).filter((statement) =>
						statement.is("lexical_declaration", "variable_declaration"),
					).length >= SETUP_DECLARATIONS,
			);
		return Promise.all(
			candidates.map(async (test) =>
				test.flag(
					"Move the setup this test shares into its describe's beforeEach, or into a helper named for what it makes, so the behavior under test leads.",
					await this.decider.decide(DROWNED, test),
					DROWNED,
				),
			),
		);
	}

	/** Calls made through one of these names, like `it.only(...)` through `it`, in order. */
	private calls(file: SourceFile, names: Set<string>): SyntaxNode[] {
		return file.ts
			.findAll({ rule: { kind: "call_expression" } })
			.filter(
				(call) =>
					names.has(callee(call)) && !call.parent()?.is("call_expression"),
			);
	}
}

/** Whether a title's first word is a gerund, a name from the code, or a condition. */
function leadsWithTheAction(title: string): boolean {
	const first = title.trim().split(/\s+/)[0] ?? "";
	return (
		/ing$/i.test(first) ||
		/[A-Z_.()]/.test(first.slice(1)) ||
		CONDITIONS.has(first.toLowerCase())
	);
}

/**
 * The name a call is made through, down to its root: `it` for `it(...)`,
 * `it.only(...)` and `it.each(cases)(...)`.
 */
function callee(call: SyntaxNode): string {
	let target = call.field("function");
	while (target?.is("member_expression", "call_expression")) {
		target = target.is("member_expression")
			? target.field("object")
			: target.field("function");
	}
	return target?.is("identifier") ? target.text : "";
}
