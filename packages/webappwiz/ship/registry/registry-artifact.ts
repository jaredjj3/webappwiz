import { color } from "webappwiz/log";
import type { Artifact, Stage } from "../artifact/artifact";
import type { Cut } from "../cut";
import type { Registry } from "./registry";

/** One package, published through the registry that carries it. */
export class RegistryArtifact implements Artifact {
	readonly packages: readonly string[];
	readonly stage: Stage = "publish";

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
			// Unreachable while the roster check a release makes holds its gate.
			throw new Error(`"${this.name}" has no workspace package`);
		}
		await this.registry.publish(dir);
		log.info(`${this.name}@${version} ${color.green("published")}`);
	}
}
