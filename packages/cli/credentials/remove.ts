import { ConsoleLogger, type Logger } from "webappwiz/log";
import { NodePs } from "webappwiz/system";
import {
	ProjectCredentials,
	type ProjectCredentialsOptions,
} from "./project-credentials";

export interface RemoveOptions extends ProjectCredentialsOptions {
	name: string;
	log?: Logger;
}

/** Deletes a credential's value from the system's store. The environment is untouched. */
export async function remove(opts: RemoveOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const ps = opts.ps ?? new NodePs();
	const project = await ProjectCredentials.open(ps.cwd(), { ...opts, ps });
	project.known(opts.name);
	log.info(
		(await project.credentials.remove(opts.name))
			? `deleted ${opts.name} from ${project.store.label} for the ${project.project} project`
			: `${opts.name} was not in ${project.store.label} for the ${project.project} project`,
	);
}
