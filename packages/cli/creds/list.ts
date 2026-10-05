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
 * Every credential the project uses, where its value would come from, and
 * what it is for. Never a value: an agent can run this to see what is
 * missing without being shown a secret.
 */
export async function list(opts: ListOptions = {}): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const ps = opts.ps ?? new NodePs();
	const project = await ProjectCredentials.open(ps.cwd(), { ...opts, ps });
	const rows: string[][] = [];
	for (const [name, purpose] of project.names) {
		const source = await project.credentials.source(name);
		rows.push([
			name,
			source === "missing" ? color.yellow(source) : color.green(source),
			color.dim(purpose),
		]);
	}
	log.info(
		[
			color.dim(
				`project ${project.project}, saved in ${project.store.label} as "webappwiz:${project.project}"`,
			),
			...table(rows),
		].join("\n"),
	);
}
