import { color } from "webappwiz/log";
import { Duration } from "webappwiz/time";
import type { Artifact, Stage } from "../artifact/artifact";
import type { Cut } from "../cut";
import type { Step, StepReport } from "../step";
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
		const publish: Step = {
			name: `${this.registry.staged ? "Stage" : "Publish"} ${this.name}@${cut.version}`,
			deadline: Duration.mins(5),
			stage: "publish",
			run: (at, report) => this.publish(at, report),
		};
		if (this.registry.staged !== true) {
			return [publish];
		}
		// Every package stages before any waits, so a person approves them in
		// one sitting, and the tag follows only once each is live.
		return [
			publish,
			{
				name: `Approve ${this.name}@${cut.version}`,
				deadline: Duration.hrs(1),
				stage: "approve",
				run: async () => {},
				check: () => this.registry.published(this.name, cut.version),
			},
		];
	}

	async publish(cut: Cut, report?: StepReport): Promise<void> {
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
		const staged = await this.registry.publish(dir);
		if (staged === undefined) {
			log.info(`${this.name}@${version} ${color.green("published")}`);
			return;
		}
		log.info(
			`${this.name}@${version} ${color.green("staged")}: approve ${staged.stageId} at ${staged.url}`,
		);
		await report?.staged({ package: this.name, version, ...staged });
	}
}
