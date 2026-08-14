import { resolve } from "node:path";
import { ConsoleLogger, type Logger } from "@webappwiz/log";
import { type Fs, NodeFs, NodePs, type Ps } from "@webappwiz/sys";

// Tag every line we add so `remove` can find and delete exactly ours.
const TAG = "# webappwiz";

const binDir = resolve(import.meta.dirname, "../../bin");

/** Which way to move `bin/`: exactly one of these is set. */
export interface PathOptions {
	add: boolean;
	remove: boolean;
}

export class Path {
	private readonly log: Logger;
	private readonly fs: Fs;
	private readonly ps: Ps;

	constructor(log?: Logger, fs?: Fs, ps?: Ps) {
		this.log = log ?? new ConsoleLogger();
		this.fs = fs ?? new NodeFs();
		this.ps = ps ?? new NodePs();
	}

	/** Exactly one of `add` or `remove` must be set; anything else throws. */
	async run(opts: PathOptions): Promise<void> {
		if (opts.add === opts.remove) {
			throw new Error("must specify one of --add or --remove");
		}
		await (opts.add ? this.add() : this.remove());
	}

	private async add(): Promise<void> {
		const profile = this.profilePath();
		const line = `export PATH="${binDir}:$PATH" ${TAG}`;
		const current = await this.fs.read(profile).catch(() => "");
		if (current.includes(line)) {
			this.log.info(`Already on PATH in ${profile}`);
			return;
		}
		await this.fs.write(profile, `${current}\n${line}\n`);
		this.log.info(
			`Added ${binDir} to ${profile}. Restart your shell to pick it up.`,
		);
	}

	private async remove(): Promise<void> {
		const profile = this.profilePath();
		const current = await this.fs.read(profile).catch(() => "");
		const kept = current.split("\n").filter((line) => !line.endsWith(TAG));
		await this.fs.write(profile, kept.join("\n"));
		this.log.info(
			`Removed ${binDir} from ${profile}. Restart your shell to pick it up.`,
		);
	}

	private profilePath(): string {
		const shellName = (this.ps.env("SHELL") ?? "/bin/bash").split("/").pop();
		return resolve(this.ps.env("HOME") ?? "~", `.${shellName}rc`);
	}
}
