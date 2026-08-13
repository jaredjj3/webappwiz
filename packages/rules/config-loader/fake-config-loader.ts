import type { ConfigLoader } from "./config-loader";

/** One request this loader was asked for, so a test can assert what a command
 * went looking for. */
export interface Asked {
	path: string;
	key: string;
}

/** Hands back the sections it was built with, whatever path it is asked for. */
export class FakeConfigLoader implements ConfigLoader {
	readonly asked: Asked[] = [];

	constructor(private readonly sections: Record<string, unknown>) {}

	async load(path: string, key: string): Promise<unknown> {
		this.asked.push({ path, key });
		return this.sections[key];
	}
}
