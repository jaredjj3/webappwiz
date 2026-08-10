import { dirname, normalize } from "node:path";
import type { Fs, MkdirOptions, RmOptions, StatResult } from "./fs";

const DIRECTORY = Symbol("directory");

/** An in-memory {@link Fs} for tests. */
export class FakeFs implements Fs {
	// Directories are entries holding DIRECTORY.
	readonly store = new Map<string, string | typeof DIRECTORY>();

	async exists(path: string): Promise<boolean> {
		return this.store.has(normalize(path));
	}

	async mkdir(path: string, options?: MkdirOptions): Promise<void> {
		const target = normalize(path);
		if (options?.recursive === false && this.store.has(target)) {
			throw new Error(`Path already exists: ${path}`);
		}
		this.store.set(target, DIRECTORY);
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

	async rename(from: string, to: string): Promise<void> {
		const source = normalize(from);
		const entry = this.store.get(source);
		if (entry === undefined) {
			throw new Error(`Path does not exist: ${from}`);
		}
		this.store.set(normalize(to), entry);
		this.store.delete(source);
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
