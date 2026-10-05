import { ConsoleLogger, type Logger } from "webappwiz/log";
import { NodePs } from "webappwiz/system";
import {
	ProjectCredentials,
	type ProjectCredentialsOptions,
} from "./project-credentials";

export interface RunOptions extends ProjectCredentialsOptions {
	/** The command and its arguments, as they would be typed. */
	command: string[];
	log?: Logger;
}

/**
 * Runs a command with every credential the project uses that the project's
 * or the device's store keeps, in its environment, for that run only: for
 * tools that read only `process.env`, like Prisma, Vite or `wrangler`. A
 * credential the project names reaches the command only from a store: an
 * exported one is replaced by the stored value, or taken out when no store
 * has it, so a stray export is never what a dev run reads. The rest of the
 * environment passes through. Nothing is written anywhere, and wiz exits
 * with the command's own code.
 */
export async function run(opts: RunOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const ps = opts.ps ?? new NodePs();
	if (opts.command.length === 0) {
		throw new Error(
			"no command to run: `bunx @webappwiz/cli creds run -- <command>`",
		);
	}
	const project = await ProjectCredentials.open(ps.cwd(), { ...opts, ps });
	const { values, missing } = await project.stored();
	if (missing.length > 0) {
		log.error(
			`not in either store, so ${opts.command[0]} runs without them: ${missing.join(", ")}`,
		);
	}
	const { exitCode } = await ps.spawn(opts.command, {
		cwd: ps.cwd(),
		env: values,
		unset: missing,
	});
	ps.exit(exitCode);
}
