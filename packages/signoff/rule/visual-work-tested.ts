import type { Verdict } from "@webappwiz/rules";
import type { Rule } from "./rule";
import doc from "./visual-work-tested.md" with { type: "text" };

export class VisualWorkTested implements Rule {
	readonly id = "visual-work-tested";
	readonly document = doc;

	/**
	 * All of it is the agent's. Trivial and tested are judgements about what a
	 * change looks like to a person, and no pattern over the lines reaches them.
	 */
	// ponytail: escalates on every changeset. Narrowing by path would spare the
	// backend-only ones a call, but CLI output is visual too, so the paths that
	// count are not the ones an extension list knows about.
	check(): Verdict {
		return { findings: [], escalate: true };
	}
}
