import { resolve } from "node:path";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";

// Tag every line we add so `remove` can find and delete exactly ours.
const TAG = "# webappwiz";

const binDir = resolve(import.meta.dirname, "../../bin");

export interface PathOptions {
	/** Which way to move `bin/`: exactly one of these is set. */
	add: boolean;
	remove: boolean;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
}

/** Exactly one of `add` or `remove` must be set; anything else throws. */
export async function path(opts: PathOptions): Promise<void> {
	if (opts.add === opts.remove) {
		throw new Error("must specify one of --add or --remove");
	}
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();

	const shellName = (ps.env("SHELL") ?? "/bin/bash").split("/").pop();
	const profile = resolve(ps.env("HOME") ?? "~", `.${shellName}rc`);
	const current = await fs.read(profile).catch(() => "");

	if (opts.remove) {
		const kept = current.split("\n").filter((line) => !line.endsWith(TAG));
		await fs.write(profile, kept.join("\n"));
		log.info(
			`Removed ${binDir} from ${profile}. Restart your shell to pick it up.`,
		);
		return;
	}

	const line = `export PATH="${binDir}:$PATH" ${TAG}`;
	if (current.includes(line)) {
		log.info(`Already on PATH in ${profile}`);
		return;
	}
	await fs.write(profile, `${current}\n${line}\n`);
	log.info(`Added ${binDir} to ${profile}. Restart your shell to pick it up.`);
}
