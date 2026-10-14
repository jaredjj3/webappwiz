import { ConsoleLogger } from "webappwiz/log";
import { NodeFs, NodePs, type Ps } from "webappwiz/system";
import { Documents } from "../documents";
import { configPaths } from "../load-config";
import { refresh } from "../skills/update";
import { moveConfig } from "./move-config";
import { reshapeBudgets } from "./reshape-budgets";
import {
	offered,
	RULES,
	type RulesProjectOptions,
	warnOfCode,
} from "./rule-set";
import { typeConfig } from "./type-config";

/** The project `update` brings up to this release of scry. */
export interface UpdateOptions extends RulesProjectOptions {
	/** Where the home directory comes from, and what runs `bunx skills add`. */
	ps?: Ps;
	/** The release to refresh the scry skill from; this package's by default. */
	version?: string;
}

/**
 * Brings the project at `dir` up to this release of scry. What older
 * releases left behind moves first: rules in `.wiz/rules` to `.wiz/scry`,
 * and the `scry` key of `.wiz/config.ts` and of the user's
 * `~/.config/wiz/config.ts` to `scry.config.ts` and
 * `~/.config/scry/config.ts`, and a scry config calling `defineConfig` to
 * `satisfies ScryConfig`, and `budgets` from a list of windows to what
 * each model may spend. Then it refreshes the shipped rules the
 * project has copies of, flagging every script that changed, and the scry
 * skill when the project has it, leaving the rules it wrote itself alone.
 * Never adds one: a rule someone chose not to install should not arrive by
 * way of an update.
 */
export async function update(opts: UpdateOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();
	// moved first so the refresh below finds them where they now belong
	const [old, now] = [`${opts.dir}/.wiz/rules`, `${opts.dir}/${RULES.root}`];
	if ((await fs.exists(old)) && !(await fs.exists(now))) {
		await fs.rename(old, now);
		log.info(`moved ${old} to ${now}`);
	} else if (await fs.exists(old)) {
		log.info(
			`${old} and ${now} both exist: move what you still want from ${old} by hand`,
		);
	}
	for (const paths of configPaths(opts.dir, ps)) {
		await moveConfig(paths, { fs, log });
		await typeConfig(paths.scry, { fs, log });
		await reshapeBudgets(paths.scry, { fs, log });
	}
	const documents = new Documents(offered(opts), RULES, { ...opts, log, fs });
	const { names, changed } = await documents.update(opts.dir);
	warnOfCode(changed, { ...opts, log });
	if (names.length === 0) {
		log.info(`no webappwiz rules in ${opts.dir}: add one with \`scry add\``);
	}
	await refresh({
		dir: opts.dir,
		log,
		fs,
		ps,
		version: opts.version,
		skills: ["scry"],
	});
}
