import { basename } from "node:path";
import { ConsoleLogger, type Logger } from "@webappwiz/log";
import { type Fs, NodeFs, walk } from "@webappwiz/sys";

/**
 * A `"@webappwiz/x": "1.2.3"` dependency entry, captured either side of the
 * version so a replace can swap it. `workspace:` ranges are left alone: inside
 * a monorepo they already resolve in lockstep, and pinning them would break it.
 */
const DEPENDENCY = /("@webappwiz\/[^"]+"\s*:\s*")(?!workspace:)[^"]*(")/g;

/** Which tree to pin, and to what. */
export interface UpdateOptions {
	/** The directory to scan recursively for manifests. */
	dir: string;
	/** The version every `@webappwiz/*` entry is set to. */
	version: string;
}

/**
 * Pins every `@webappwiz/*` dependency under `dir` to one version, so a project
 * never runs two of these packages built against different versions of each
 * other. They are released together, so there is only ever one right answer.
 */
export async function update(
	opts: UpdateOptions,
	log?: Logger,
	fs?: Fs,
): Promise<void> {
	const out = log ?? new ConsoleLogger();
	const files = fs ?? new NodeFs();
	let count = 0;
	for await (const path of walk(opts.dir, files)) {
		if (basename(path) !== "package.json") {
			continue;
		}
		// substitution, not parse-and-stringify: rewriting the JSON would
		// reflow manifests we have no business reformatting.
		const before = await files.read(path);
		const after = before.replace(DEPENDENCY, `$1${opts.version}$2`);
		if (after === before) {
			continue;
		}
		await files.write(path, after);
		out.info(`updated ${path}`);
		count++;
	}
	out.info(`${count} package.json pinned to ${opts.version}`);
}
