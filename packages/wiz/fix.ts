import type { Lint } from "@webappwiz/lint";
import { color, type Logger } from "@webappwiz/log";
import type { Ps } from "@webappwiz/sys";

export interface FixOptions {
	/** Report problems without writing fixes, as CI wants it. */
	check: boolean;
}

export class Fix {
	constructor(
		private readonly log: Logger,
		private readonly ps: Ps,
		private readonly linter: Pick<Lint, "run">,
	) {}

	/** Pass `check: true` to report problems without writing fixes. */
	async run(opts: FixOptions): Promise<void> {
		await this.biome(opts.check);
		await this.lint();
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

	private async lint(): Promise<void> {
		const ok = await this.linter.run();
		this.log.info(`lint: ${ok ? color.green("success") : color.red("failed")}`);
		if (!ok) {
			throw new Error("Lint failed");
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
