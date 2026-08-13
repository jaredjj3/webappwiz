/**
 * Turns a config module path and a section key into whatever that section
 * holds, or undefined when the module has no such section.
 *
 * The value comes back unchecked on purpose: a section's shape is known to the
 * command that asked for it and to nothing else, so guarding it is that
 * command's job.
 */
export interface ConfigLoader {
	load(path: string, key: string): Promise<unknown>;
}
