import { ConsoleLogger, type Logger } from "webappwiz/log";
import { NodePs } from "webappwiz/system";
import {
	ProjectCredentials,
	type ProjectCredentialsOptions,
} from "./project-credentials";

export interface RemoveOptions extends ProjectCredentialsOptions {
	name: string;
	/** Deletes it from the device's store rather than the project's. */
	device?: boolean;
	log?: Logger;
}

/** Deletes a credential's value from one of the system's stores. The environment is untouched. */
export async function remove(opts: RemoveOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const ps = opts.ps ?? new NodePs();
	const project = await ProjectCredentials.open(ps.cwd(), { ...opts, ps });
	project.known(opts.name);
	const store = project.keptIn(opts.device ?? false);
	log.info(
		(await store.delete(opts.name))
			? `deleted ${opts.name} from ${store.label}`
			: `${opts.name} was not in ${store.label}`,
	);
}
