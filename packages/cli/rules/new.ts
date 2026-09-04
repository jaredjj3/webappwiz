import { RULE_FILE, RULES_ROOT, template } from "@webappwiz/rules";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import { type Fs, NodeFs } from "webappwiz/system";

export interface NewOptions {
	/** The rule's id, kebab case, and the directory it gets. */
	name: string;
	/** The project root: the directory holding `.wiz/rules`. */
	dir: string;
	log?: Logger;
	fs?: Fs;
}

/**
 * Scaffolds a rule to fill in: `.wiz/rules/<name>/RULE.md`, with every field
 * a review needs and the headings a rule has to have. Refuses to overwrite a
 * rule that is already there.
 */
export async function newRule(opts: NewOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	const dir = `${opts.dir}/${RULES_ROOT}/${opts.name}`;
	const path = `${dir}/${RULE_FILE}`;
	if (await fs.exists(path)) {
		throw new Error(`${path} already exists`);
	}
	// validates the name too: the template will not parse under one that is
	// not kebab case
	const doc = template(opts.name);
	await fs.mkdir(dir);
	await fs.write(path, doc);
	log.info(`wrote ${path}`);
}
