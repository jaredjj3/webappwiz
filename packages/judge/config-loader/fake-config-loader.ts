import type { Config } from "../config";
import type { ConfigLoader } from "./config-loader";

/** Hands back the config it was built with, whatever path it is asked for. */
export class FakeConfigLoader implements ConfigLoader {
	readonly paths: string[] = [];

	constructor(private readonly config: Config) {}

	async load(path: string): Promise<Config> {
		this.paths.push(path);
		return this.config;
	}
}
