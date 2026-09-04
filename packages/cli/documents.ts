import { dirname } from "node:path";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import { type Fs, NodeFs } from "webappwiz/system";

/** Where one kind of document lives in a project. */
export interface Layout {
	/** Under the project root: one directory per document, named after it. */
	root: string;
	/** The file each of those directories holds. */
	file: string;
	/** What a message calls one of them. */
	noun: string;
}

/** What `Documents` reads and writes through; the real ones by default. */
export interface DocumentsOptions {
	log?: Logger;
	fs?: Fs;
}

/** The `version:` in a document's frontmatter, or null when it has none. */
export function versionOf(md: string): string | null {
	// frontmatter only, so a `version:` inside a fenced example in the body is
	// not mistaken for the real one
	const frontmatter = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
	return frontmatter.match(/^version:\s*(.+)$/m)?.[1]?.trim() ?? null;
}

/**
 * Documents a package bundles and a project installs copies of: skills under
 * `.agents/skills`, rules under `.wiz/rules`. Each copy's frontmatter carries
 * the version it came from, so a stale copy is visible rather than merely
 * wrong, and refreshing is copying again.
 */
export class Documents {
	private log: Logger;
	private fs: Fs;

	constructor(
		/** Name to document, as bundled. */
		private docs: Record<string, string>,
		private layout: Layout,
		opts: DocumentsOptions = {},
	) {
		this.log = opts.log ?? new ConsoleLogger();
		this.fs = opts.fs ?? new NodeFs();
	}

	/** Every document on offer, name and text, in name order. */
	available(): Array<[string, string]> {
		return Object.entries(this.docs).toSorted(([left], [right]) =>
			left.localeCompare(right),
		);
	}

	/** Where a project keeps its copy of `name`. */
	path(dir: string, name: string): string {
		return `${dir}/${this.layout.root}/${name}/${this.layout.file}`;
	}

	/** The names a project has a copy of, ours or not, in name order. */
	async installed(dir: string): Promise<string[]> {
		const names = await this.fs
			.readdir(`${dir}/${this.layout.root}`)
			.catch((): string[] => []); // no such directory is just "none installed"
		const present: string[] = [];
		for (const name of names.toSorted()) {
			if (await this.fs.exists(this.path(dir, name))) {
				present.push(name);
			}
		}
		return present;
	}

	/** The version a project's copy came from; null when there is no copy. */
	async installedVersion(dir: string, name: string): Promise<string | null> {
		return this.fs
			.read(this.path(dir, name))
			.then(versionOf)
			.catch((): null => null); // not installed, or not readable: same answer here
	}

	/** Installs one bundled document, or throws naming what there is. */
	async add(name: string, dir: string): Promise<void> {
		const doc = this.docs[name];
		if (doc === undefined) {
			const have = this.available().map(([known]) => known);
			throw new Error(
				`no such ${this.layout.noun}: ${name} (have ${have.join(", ")})`,
			);
		}
		await this.copy(name, doc, dir);
	}

	/**
	 * Refreshes the bundled documents a project already has and returns their
	 * names. Never adds one: a document someone chose not to install should
	 * not arrive by way of an update.
	 */
	async update(dir: string): Promise<string[]> {
		const installed = await this.installed(dir);
		const ours = this.available().filter(([name]) => installed.includes(name));
		for (const [name, doc] of ours) {
			await this.copy(name, doc, dir);
		}
		return ours.map(([name]) => name);
	}

	private async copy(name: string, doc: string, dir: string): Promise<void> {
		// a copy, not a merge: replacing whatever is there is what makes the
		// version in a document's frontmatter mean anything
		const target = this.path(dir, name);
		await this.fs.mkdir(dirname(target));
		await this.fs.write(target, doc);
		this.log.info(`wrote ${target}`);
	}
}
