import { Git, RULES_ROOT } from "@webappwiz/scry";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import { type Fs, NodeFs, NodePs, type Ps, walk } from "webappwiz/system";

export interface TestOptions {
	/** Rule ids; every rule when empty. */
	ids: string[];
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
}

/**
 * Runs the tests beside each rule in the project's `.wiz/scry`, the project
 * being the git repository the working directory is in. Bun's own discovery skips
 * a directory whose name starts with a dot, so they are handed to it by path.
 * Exits with bun's code.
 */
export async function test(opts: TestOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();
	const { root: dir } = await Git.locate(ps.cwd(), [], { ps });
	const root = `${dir}/${RULES_ROOT}`;
	const ids =
		opts.ids.length > 0
			? opts.ids
			: await fs.readdir(root).catch((): string[] => []);
	const tests: string[] = [];
	for (const id of ids.filter((id) => !id.startsWith("."))) {
		if (!(await fs.exists(`${root}/${id}`))) {
			throw new Error(`no rule "${id}" in ${RULES_ROOT}`);
		}
		for await (const path of walk(`${root}/${id}`, { fs })) {
			if (path.endsWith(".test.ts")) {
				tests.push(path);
			}
		}
	}
	if (tests.length === 0) {
		log.info(`no tests in ${RULES_ROOT}`);
		return;
	}
	const { exitCode } = await ps.spawn(["bun", "test", ...tests.toSorted()]);
	if (exitCode !== 0) {
		ps.exit(exitCode);
	}
}
