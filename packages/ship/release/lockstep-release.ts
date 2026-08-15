import type { Cut } from "../cut";
import { GitRelease } from "./git-release";
import type { Release } from "./release";

/** Every part of a release, run in the order declared, at one version. */
export class LockstepRelease implements Release {
	private readonly parts: Release[];

	constructor(...parts: Release[]) {
		const tag = parts.findIndex((part) => part instanceof GitRelease);
		const publishing = parts.map((part) => part.packages.length > 0);
		if (tag !== -1 && publishing.lastIndexOf(true) > tag) {
			throw new Error(
				"releases.git() is declared before a package it would tag: tag a version no registry took and the lie outlives the failure",
			);
		}
		this.parts = parts;
	}

	get packages(): readonly string[] {
		return this.parts.flatMap((part) => [...part.packages]);
	}

	async publish(cut: Cut): Promise<void> {
		for (const part of this.parts) {
			await part.publish(cut);
		}
	}
}
