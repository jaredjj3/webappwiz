import { ConsoleLogger, type Logger } from "webappwiz/log";
import { NodePs } from "webappwiz/system";
import {
	ProjectCredentials,
	type ProjectCredentialsOptions,
} from "./project-credentials";
import { ProcessSecretInput, type SecretInput } from "./secret-input";

export interface AddOptions extends ProjectCredentialsOptions {
	name: string;
	/** Reads the value piped in on stdin, rather than asking a person for it. */
	stdin: boolean;
	/** Keeps it in the device's store, for every project, not the project's. */
	device?: boolean;
	log?: Logger;
	input?: SecretInput;
}

/**
 * Keeps a credential's value in the system's store. A person types it at a
 * prompt that shows nothing, so the value is in no shell history, file or
 * agent's context; with no terminal it refuses, unless `stdin` says the
 * value is piped in.
 */
export async function add(opts: AddOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const ps = opts.ps ?? new NodePs();
	const input = opts.input ?? new ProcessSecretInput();
	const project = await ProjectCredentials.open(ps.cwd(), { ...opts, ps });
	project.known(opts.name);
	const value = opts.stdin
		? (await input.piped()).trim()
		: await input.hidden(`${opts.name}: `);
	if (value === undefined) {
		throw new Error(
			`no terminal to ask for ${opts.name} on: ask a person to run \`bunx @webappwiz/cli creds add ${opts.name}\` themselves`,
		);
	}
	if (value === "") {
		throw new Error(`no value given for ${opts.name}: nothing saved`);
	}
	const store = project.keptIn(opts.device ?? false);
	await store.set(opts.name, value);
	log.info(`saved ${opts.name} to ${store.label}`);
	const source = await project.credentials.source(opts.name);
	if (source !== store) {
		log.error(
			`${opts.name} is also in ${source?.label}, which wiz reads first`,
		);
	}
}
