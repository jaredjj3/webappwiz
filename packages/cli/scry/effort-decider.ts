import type { DecideOptions, Decider, Effort, Span } from "@webappwiz/scry";
import type { ByEffort } from "../config";

/**
 * A decider that hands each question to the one for the effort it asks at,
 * or to the default's when it names none, or one left out.
 */
export class EffortDecider implements Decider {
	constructor(private deciders: ByEffort<Decider>) {}

	decide(
		question: string,
		about: Span,
		opts: DecideOptions = {},
	): Promise<number> {
		return this.at(opts.effort).decide(question, about, opts);
	}

	private at(effort: Effort | undefined): Decider {
		return (effort && this.deciders[effort]) ?? this.deciders.default;
	}
}
