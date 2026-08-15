import { color } from "@webappwiz/log";
import type { Cut } from "../cut";
import type { Registry } from "../registry/registry";
import type { Release } from "./release";

/** One package, published through the registry that carries it. */
export class RegistryRelease implements Release {
	readonly packages: readonly string[];

	constructor(
		private readonly name: string,
		private readonly registry: Registry,
	) {
		this.packages = [name];
	}

	async publish(cut: Cut): Promise<void> {
		const { version, log } = cut;
		if (await this.registry.published(this.name, version)) {
			log.info(`${this.name}@${version} ${color.green("already published")}`);
			return;
		}
		const dir = cut.dir(this.name);
		if (dir === undefined) {
			// Unreachable while the roster check `ship` makes holds its gate.
			throw new Error(`"${this.name}" has no workspace package`);
		}
		await this.registry.publish(dir);
		log.info(`${this.name}@${version} ${color.green("published")}`);
	}
}
