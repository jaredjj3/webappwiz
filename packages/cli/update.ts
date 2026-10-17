import { basename } from "node:path";
import type { ShippedRule } from "@webappwiz/scry/catalog";
import type { SecretStore } from "webappwiz/creds";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import { type Fs, NodeFs, NodePs, type Ps, walk } from "webappwiz/system";
import { ProjectCredentials } from "./creds/project-credentials";
import { update as updateScry } from "./scry/update";
import { project } from "./skills/skill";
import { refresh as refreshSkills } from "./skills/update";

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
	ps?: Ps;
	/** The project's credential store; the system's by default. */
	store?: SecretStore;
	/** The device's credential store; the system's by default. */
	deviceStore?: SecretStore;
	/** The skills of its own to refresh; `webappwiz` by default. */
	skills?: string[];
	/** The rules to refresh with; the catalog by default. */
	rules?: Record<string, ShippedRule>;
}

/**
 * Pins every webappwiz dependency under `dir` to one version, so a project
 * never runs two of these packages built against different versions of each
 * other. They are released together, so there is only ever one right answer.
 * A manifest still naming `@webappwiz/rules` gets `@webappwiz/scry`. Then it
 * refreshes the webappwiz skill, when the project has it, and runs
 * `scry update` at that version, which brings along what older releases left
 * behind. Splates keeps its own pace: a project with its skill is told to run
 * `splates update`, which this never imports. Last, it names any credential the
 * project uses that nothing has yet, and the command a person runs to add
 * it, since an upgrade is when a new one starts to matter.
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
	const ps = opts.ps ?? new NodePs();
	await refreshSkills({
		dir: opts.dir,
		log,
		fs,
		ps,
		version: opts.version,
		skills: opts.skills ?? ["webappwiz"],
		retired: {},
	});
	const { skills } = project({ dir: opts.dir, fs, ps, log });
	const installed = await skills.installed();
	if (installed.includes("splates") || installed.includes("arbor")) {
		log.info(
			"this project has the splates skill; run `bunx @stringsync/splates update` to bring splates up to date",
		);
	}
	await updateScry({
		dir: opts.dir,
		log,
		fs,
		ps,
		version: opts.version,
		rules: opts.rules,
	});
	const credentials = await ProjectCredentials.open(opts.dir, {
		fs,
		ps,
		store: opts.store,
		deviceStore: opts.deviceStore,
	});
	const missing = await credentials.missing();
	if (missing.length > 0) {
		log.info(
			[
				`${missing.length} ${missing.length === 1 ? "credential" : "credentials"} missing; a person runs:`,
				...missing.map((name) => `  bunx @webappwiz/cli creds add ${name}`),
			].join("\n"),
		);
	}
}
