import { ConsoleLogger, color, type Logger } from "@webappwiz/log";
import type { Check } from "@webappwiz/rules";
import { NodePs, type Ps } from "@webappwiz/sys";

import type { Fix, FixOptions } from "./fix";

/** Runs biome, the config's checks, and the type checker, in that order. */
export class ToolchainFix implements Fix {
	private readonly log: Logger;
	private readonly ps: Ps;

	constructor(
		private readonly checks: Pick<Check, "run">,
		log?: Logger,
		ps?: Ps,
	) {
		this.log = log ?? new ConsoleLogger();
		this.ps = ps ?? new NodePs();
	}

	/** Pass `check: true` to report problems without writing fixes. */
	async run(opts: FixOptions): Promise<void> {
		await this.biome(opts.check);
		await this.check();
		await this.typecheck();
	}

	private async biome(check: boolean): Promise<void> {
		const flags = check ? [] : ["--write", "--unsafe"];
		const { exitCode } = await this.ps.spawn([
			"bunx",
			"biome",
			"check",
			...flags,
			".",
		]);
		if (exitCode === 0) {
			this.log.info(`biome: ${color.green("success")}`);
		} else {
			this.log.info(`biome: ${color.red("failed")}`);
			throw new Error("Biome check failed");
		}
	}

	private async check(): Promise<void> {
		const ok = await this.checks.run();
		this.log.info(
			`check: ${ok ? color.green("success") : color.red("failed")}`,
		);
		if (!ok) {
			throw new Error("Checks failed");
		}
	}

	private async typecheck(): Promise<void> {
		// One root tsconfig covers every workspace, so a single tsc run is enough here.
		const { exitCode } = await this.ps.spawn(["bunx", "tsc", "--noEmit"]);
		this.log.info(
			`typecheck: ${exitCode === 0 ? color.green("success") : color.red("failed")}`,
		);
		if (exitCode !== 0) {
			throw new Error("Typechecking failed");
		}
	}
}
