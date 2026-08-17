import { basename } from "node:path";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import { type Fs, NodeFs, walk } from "webappwiz/system";
import type { Skills } from "./skills/skill";
import { update as updateSkills } from "./skills/update";

/**
 * A `"webappwiz": "1.2.3"` or `"@webappwiz/x": "1.2.3"` dependency entry,
 * captured either side of the version so a replace can swap it. Core is
 * published unscoped, so matching the scope alone would skip the one package
 * everything else is built against, and say nothing about having done so.
 * `workspace:` ranges are left alone: inside a monorepo they already resolve in
 * lockstep, and pinning them would break it.
 */
const DEPENDENCY =
	/("(?:webappwiz|@webappwiz\/[^"]+)"\s*:\s*")(?!workspace:)[^"]*(")/g;

/** Which tree to pin, and to what. */
export interface UpdateOptions {
	/** The directory to scan recursively for manifests. */
	dir: string;
	/** The version every webappwiz entry is set to. */
	version: string;
	log?: Logger;
	fs?: Fs;
	/** The skills to refresh with; the ones this package ships by default. */
	skills?: Skills;
}

/**
 * Pins every webappwiz dependency under `dir` to one version, so a project
 * never runs two of these packages built against different versions of each
 * other. They are released together, so there is only ever one right answer.
 * Installed skills are copies of files those packages ship, so they are
 * refreshed too.
 */
export async function update(opts: UpdateOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	let count = 0;
	for await (const path of walk(opts.dir, { fs })) {
		if (basename(path) !== "package.json") {
			continue;
		}
		// substitution, not parse-and-stringify: rewriting the JSON would
		// reflow manifests we have no business reformatting.
		const before = await fs.read(path);
		const after = before.replace(DEPENDENCY, `$1${opts.version}$2`);
		if (after === before) {
			continue;
		}
		await fs.write(path, after);
		log.info(`updated ${path}`);
		count++;
	}
	log.info(`${count} package.json pinned to ${opts.version}`);
	await updateSkills({ dir: opts.dir, log: log, fs: fs, skills: opts.skills });
}
