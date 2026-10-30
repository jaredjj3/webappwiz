import { color } from "webappwiz/log";
import { Duration } from "webappwiz/time";
import type { Artifact, Stage } from "../artifact/artifact";
import type { Cut } from "../cut";
import type { CheckReport, Step, StepReport } from "../step";
import type { Registry } from "./registry";

/** How long a version may wait to go live before its `Live` step reports it `held`. */
// npm's scan takes about five minutes, fifteen at its busiest, and holds some
// versions for a person at npm to review, so this is well past the busiest.
const HELD_AFTER = Duration.mins(20);

/** One package, published through the registry that carries it. */
export class RegistryArtifact implements Artifact {
	readonly packages: readonly string[];
	readonly stage: Stage = "publish";
	private saidHeld = false;

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
		if (this.registry.staged !== true && this.registry.scans !== true) {
			return [publish];
		}
		// Every package goes out before any waits, so a person approves them in
		// one sitting and the scans run side by side, and the tag follows only
		// once each is live. The wait never gives up: a version npm holds for
		// review goes live once it passes, and a rerun would only wait again.
		return [
			publish,
			{
				name: `Live ${this.name}@${cut.version}`,
				deadline: Duration.hrs(1),
				stage: "approve",
				run: async () => {},
				check: (at, waited) => this.live(at, waited),
			},
		];
	}

	/** Whether the version is installable yet, and if not, what it may be waiting on. */
	async live(cut: Cut, waited: Duration): Promise<CheckReport> {
		const { version, log } = cut;
		if (await this.registry.published(this.name, version)) {
			return { passed: true };
		}
		const url = this.registry.page?.(this.name, version);
		const status = waited.isLessThan(HELD_AFTER) ? "pending" : "held";
		if (waited.isEqual(Duration.zero())) {
			this.saidHeld = false;
			log.info(
				`${this.name}@${version} ${color.yellow("not live yet")}: waiting for ${this.registry.staged === true ? "approval and " : ""}the registry's checks`,
			);
		} else if (status === "held" && !this.saidHeld) {
			this.saidHeld = true;
			log.info(
				`${this.name}@${version} ${color.yellow("still not live")} after ${waited.human()}: the registry may be holding it for review${url === undefined ? "" : `, see ${url}`}`,
			);
		}
		return { passed: false, status, ...(url === undefined ? {} : { url }) };
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
		const { already, staged } = await this.registry.publish(dir);
		if (already === true) {
			log.info(
				`${this.name}@${version} ${color.green("already accepted")}: the registry took it on an earlier run`,
			);
			return;
		}
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
