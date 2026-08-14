import type { Rule } from "@webappwiz/rules";
import doc from "./visual-work-tested.md" with { type: "text" };

/**
 * A document only: no command runs the signoff rules, so this is the whole of
 * the rule, and the agent about to merge is what applies it.
 *
 * All of it is a judgement anyway. Trivial and tested are things a change
 * looks like to a person, and no pattern over the lines reaches them.
 */
export class VisualWorkTested implements Rule {
	readonly id = "visual-work-tested";
	readonly document = doc;
}
