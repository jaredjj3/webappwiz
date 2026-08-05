import { resolve } from "node:path";
import type { Logger } from "@webappwiz/log";
import type { Fs } from "@webappwiz/sys";

// Tag every line we add so `remove` can find and delete exactly ours.
const TAG = "# webappwiz";

function profilePath(): string {
	const shellName = (process.env.SHELL ?? "/bin/bash").split("/").pop();
	return resolve(process.env.HOME ?? "~", `.${shellName}rc`); // ~/.zshrc, ~/.bashrc, etc.
}

const binDir = resolve(import.meta.dir, "../bin");

async function add(log: Logger, fs: Fs): Promise<void> {
	const profile = profilePath();
	const line = `export PATH="${binDir}:$PATH" ${TAG}`;
	const current = await fs.read(profile).catch(() => "");
	if (current.includes(line)) {
		log.info(`Already on PATH in ${profile}`);
		return;
	}
	await fs.write(profile, `${current}\n${line}\n`);
	log.info(`Added ${binDir} to ${profile} — restart your shell to pick it up.`);
}

async function remove(log: Logger, fs: Fs): Promise<void> {
	const profile = profilePath();
	const current = await fs.read(profile).catch(() => "");
	const kept = current.split("\n").filter((l) => !l.endsWith(TAG));
	await fs.write(profile, kept.join("\n"));
	log.info(
		`Removed ${binDir} from ${profile} — restart your shell to pick it up.`,
	);
}

export async function path(
	opts: { add: boolean; remove: boolean },
	log: Logger,
	fs: Fs,
): Promise<void> {
	if (opts.add && opts.remove) {
		throw new Error("must specify one of --add or --remove");
	} else if (opts.add) {
		await add(log, fs);
	} else if (opts.remove) {
		await remove(log, fs);
	} else {
		throw new Error("must specify one of --add or --remove");
	}
}
