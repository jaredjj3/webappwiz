import type { Decider } from "./decider";
import { Unasked } from "./unasked";

/**
 * A decider standing in for a model the caller turned off: it throws
 * `Unasked` for every question, so a check built with it runs only what
 * code decides, or what the other model does.
 */
export class DisabledDecider implements Decider {
	/** `reason` is why the model is off, which the report gives. */
	constructor(private readonly reason: string) {}

	async decide(): Promise<number> {
		throw new Unasked(this.reason, "disabled");
	}
}
