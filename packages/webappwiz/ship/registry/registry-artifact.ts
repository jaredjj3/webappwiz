import { color } from "webappwiz/log";
import { Duration } from "webappwiz/time";
import type { Artifact, Stage } from "../artifact/artifact";
import type { Cut } from "../cut";
import type { Step } from "../step";
import type { Registry } from "./registry";

/** One package, published through the registry that carries it. */
export class RegistryArtifact implements Artifact {
	readonly packages: readonly string[];
	readonly stage: Stage = "publish";

	constructor(
		readonly name: string,
		private readonly registry: Registry,
	) {
		this.packages = [name];
	}

	deployed(): Promise<string | undefined> {
		return this.registry.deployed(this.name);
	}

	steps(cut: Cut): readonly Step[] {
		return [
			{
				name: `Publish ${this.name}@${cut.version}`,
				deadline: Duration.mins(5),
				stage: "publish",
				run: () => this.publish(cut),
			},
			{
				name: `Available ${this.name}@${cut.version}`,
				deadline: Duration.mins(15),
				stage: "publish",
				run: async () => {},
				check: async () => {
					if (this.registry.available !== undefined) {
						return this.registry.available(this.name, cut.version);
					}
					return this.registry.published(this.name, cut.version);
				},
			},
		];
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
