import type { Cut } from "../cut";
import type { Part, Stage } from "./part";

/**
 * A part publishing the packages it was named for, at the `publish` stage
 * unless a test moves `stage`. `cuts` holds every release it went into.
 */
export class FakePart implements Part {
	readonly cuts: Cut[] = [];
	stage?: Stage;

	constructor(readonly packages: readonly string[] = []) {}

	async publish(cut: Cut): Promise<void> {
		this.cuts.push(cut);
	}
}
