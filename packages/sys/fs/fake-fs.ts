import { dirname, normalize } from "node:path";
import type { Fs, RmOptions, StatResult } from "./fs";

const DIRECTORY = Symbol("directory");

/**
 * FakeFs is an in-memory Fs for tests. Directories are entries holding DIRECTORY.
 */
export class FakeFs implements Fs {
	readonly store = new Map<string, string | typeof DIRECTORY>();

	async exists(path: string): Promise<boolean> {
		return this.store.has(normalize(path));
	}

	async mkdir(path: string): Promise<void> {
		this.store.set(normalize(path), DIRECTORY);
	}

	async read(path: string): Promise<string> {
		const content = this.store.get(normalize(path));
		if (content === undefined || content === DIRECTORY) {
			throw new Error(`File does not exist: ${path}`);
		}
		return content;
	}

	async write(path: string, data: string): Promise<void> {
		this.store.set(normalize(path), data);
	}

	async readdir(path: string): Promise<string[]> {
		const dir = normalize(path);
		return [...this.store.keys()]
			.filter((key) => key !== dir && dirname(key) === dir)
			.map((key) => key.slice(dir.endsWith("/") ? dir.length : dir.length + 1));
	}

	async stat(path: string): Promise<StatResult> {
		const entry = this.store.get(normalize(path));
		if (entry === undefined) {
			throw new Error(`Path does not exist: ${path}`);
		}
		return { isDirectory: () => entry === DIRECTORY };
	}

	async rm(path: string, options?: RmOptions): Promise<void> {
		const target = normalize(path);
		if (!options?.force && !this.store.has(target)) {
			throw new Error(`Path does not exist: ${path}`);
		}
		this.store.delete(target);
		if (options?.recursive) {
			for (const key of this.store.keys()) {
				if (key.startsWith(`${target}/`)) {
					this.store.delete(key);
				}
			}
		}
	}
}
