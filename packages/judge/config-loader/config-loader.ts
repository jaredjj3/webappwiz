import type { Config } from "../config";

/** Turns a config module path into the config it default-exports. */
export interface ConfigLoader {
	load(path: string): Promise<Config>;
}
