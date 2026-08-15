import type { Cut } from "../cut";
import type { Release } from "./release";

/**
 * A part publishing the packages it was named for. `cuts` holds every release
 * it was published into.
 */
export class FakeRelease implements Release {
	readonly cuts: Cut[] = [];

	constructor(readonly packages: readonly string[] = []) {}

	async publish(cut: Cut): Promise<void> {
		this.cuts.push(cut);
	}
}
