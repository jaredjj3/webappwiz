import { MarkdownWriter } from "webappwiz/md";
import type { Review } from "./review";

/**
 * The prompt one review is spawned with: the rules verbatim, the caller's
 * material, and the output contract the harness parses back.
 *
 * Standalone so a caller can print what a run would send, or price it, without
 * spawning anything or holding a harness to ask.
 */
export function prompt(review: Review): string {
	const count = review.rules.length;
	const writer = new MarkdownWriter().text(
		`You are checking against exactly ${count} ` +
			`rule${count === 1 ? "" : "s"}, listed below. Apply only ` +
			"these rules; ignore every other concern you notice.",
	);
	for (const rule of review.rules) {
		writer.text(`Rule \`${rule.id}\`, verbatim:`);
		writer.code("markdown", rule.document);
	}
	writer.text(review.context);
	if (review.instructions !== undefined) {
		writer.text(review.instructions);
	}
	return writer
		.text(
			[
				"Report every violation of any of these rules as an element of one JSON array:",
				"",
				'[{"rule": "<rule id>", "message": "<how this breaks the rule>", "file": "<path>", "line": <1-based line number>}]',
				"",
				'"file" and "line" locate a finding that is somewhere in particular. ' +
					"Leave both out when the rule is about the change as a whole rather " +
					"than about a place in it.",
				"",
				'"message" states what the code does that the rule forbids, naming the ' +
					"construct it applies to. One clause, lowercase, no trailing period.",
				"",
				"Never say what to do about it. Deciding the fix belongs to the reader, " +
					"who knows things you do not. " +
					'Write "greet and greetAll each take a clock parameter", not ' +
					'"give them a constructor". Write "the comment restates the increment ' +
					'below it", not "delete the comment".',
				"",
				"Output only the JSON array and nothing else. No violations means [].",
			].join("\n"),
		)
		.toString();
}
