import { color } from "@webappwiz/log";
import type { Problem } from "../problem";
import type { Registry } from "../registry/registry";
import type { Release } from "../release/release";
import type { Ship } from "./ship";

/** One package, published through the registry that carries it. */
export class RegistryShip implements Ship {
	readonly packages: readonly string[];

	constructor(
		private readonly name: string,
		private readonly registry: Registry,
	) {
		this.packages = [name];
	}

	problems(): Promise<Problem[]> {
		return this.registry.problems();
	}

	async run(release: Release): Promise<void> {
		const { version, log } = release;
		if (await this.registry.published(this.name, version)) {
			log.info(`${this.name}@${version} ${color.green("already published")}`);
			return;
		}
		const dir = release.dir(this.name);
		if (dir === undefined) {
			// Unreachable while the roster check the runner makes holds its gate.
			throw new Error(`"${this.name}" has no workspace package`);
		}
		await this.registry.publish(dir);
		log.info(`${this.name}@${version} ${color.green("published")}`);
	}
}
