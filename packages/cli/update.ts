import { basename } from "node:path";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import { type Fs, NodeFs, walk } from "webappwiz/system";
import type { Bundle } from "./documents";
import { update as updateRules } from "./scry/update";
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

/**
 * What a package was published as before it was renamed, keyed by its old
 * name, so a manifest still naming it gets the new one.
 */
const RENAMED: Record<string, string> = {
	"@webappwiz/rules": "@webappwiz/scry",
};

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
	/** The rules to refresh with; the catalog by default. */
	rules?: Record<string, Bundle>;
}

/**
 * Pins every webappwiz dependency under `dir` to one version, so a project
 * never runs two of these packages built against different versions of each
 * other. They are released together, so there is only ever one right answer.
 * Installed skills are copies of files those packages ship, so they are
 * refreshed too, and so are the rules copied in from the catalog. What a
 * rename left behind moves along: `@webappwiz/rules` becomes
 * `@webappwiz/scry`, and `.wiz/rules` becomes `.wiz/scry`.
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
		const after = Object.entries(RENAMED)
			.reduce(
				(text, [old, now]) => text.replaceAll(`"${old}"`, `"${now}"`),
				before,
			)
			.replace(DEPENDENCY, `$1${opts.version}$2`);
		if (after === before) {
			continue;
		}
		await fs.write(path, after);
		log.info(`updated ${path}`);
		count++;
	}
	log.info(`${count} package.json pinned to ${opts.version}`);
	// rules lived in .wiz/rules before scry; moved first so the refresh
	// below finds them where they now belong
	const [old, now] = [`${opts.dir}/.wiz/rules`, `${opts.dir}/.wiz/scry`];
	if ((await fs.exists(old)) && !(await fs.exists(now))) {
		await fs.rename(old, now);
		log.info(`moved ${old} to ${now}`);
	} else if (await fs.exists(old)) {
		log.info(
			`${old} and ${now} both exist: move what you still want from ${old} by hand`,
		);
	}
	await updateSkills({ dir: opts.dir, log: log, fs: fs, skills: opts.skills });
	await updateRules({ dir: opts.dir, log, fs, rules: opts.rules });
}
