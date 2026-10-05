import { ConsoleLogger, color, type Logger } from "webappwiz/log";
import { NodePs } from "webappwiz/system";
import { table } from "../table";
import {
	ProjectCredentials,
	type ProjectCredentialsOptions,
} from "./project-credentials";

export interface ListOptions extends ProjectCredentialsOptions {
	log?: Logger;
}

/**
 * Every credential the project uses, where wiz would read its value from,
 * and what it is for. Never a value: an agent can run this to see what is
 * missing without being shown a secret.
 */
export async function list(opts: ListOptions = {}): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const ps = opts.ps ?? new NodePs();
	const project = await ProjectCredentials.open(ps.cwd(), { ...opts, ps });
	const rows: string[][] = [];
	for (const [name, purpose] of project.names) {
		const source = await project.credentials.source(name);
		const where =
			source === undefined
				? color.yellow("missing")
				: color.green(
						source === project.store
							? "project"
							: source === project.device
								? "device"
								: "environment",
					);
		rows.push([name, where, color.dim(purpose)]);
	}
	log.info(
		[
			color.dim(`project: ${project.store.label}`),
			color.dim(`device:  ${project.device.label}`),
			...table(rows),
		].join("\n"),
	);
}
