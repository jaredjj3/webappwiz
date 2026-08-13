import type { Changeset } from "../changeset";
import type { Changes } from "./changes";

/** Hands back the changeset it was built with, whatever base it is asked for. */
export class FakeChanges implements Changes {
	readonly asked: string[] = [];

	constructor(private readonly changeset: Changeset) {}

	async since(base: string): Promise<Changeset> {
		this.asked.push(base);
		return { ...this.changeset, base };
	}
}
