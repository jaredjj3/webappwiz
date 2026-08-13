import type { Fs, Ps } from "@webappwiz/sys";
import type { Change, Changeset, Status } from "../changeset";
import type { Changes } from "./changes";

const STATUS: Record<string, Status> = {
	A: "added",
	M: "modified",
	D: "deleted",
	R: "modified",
	C: "added",
	T: "modified",
};

/**
 * What git says the tree has changed since a ref, including work that is not
 * committed and files git has never been told about.
 *
 * Measured against the ref rather than between two commits, so uncommitted and
 * unstaged edits count: a loop that has just finished editing has committed
 * nothing, and a changeset that missed that would be the whole change.
 */
export class GitChanges implements Changes {
	constructor(
		private readonly ps: Ps,
		private readonly fs: Fs,
		private readonly dir: string = ".",
	) {}

	async since(base: string): Promise<Changeset> {
		const changes = new Map<string, Change>();
		for (const [path, status] of await this.named(base)) {
			changes.set(path, { path, status, added: [] });
		}
		for (const [path, added] of await this.patch(base)) {
			const change = changes.get(path);
			if (change) {
				changes.set(path, { ...change, added });
			}
		}
		for (const path of await this.untracked()) {
			// Never diffed, so the whole file is what this change adds.
			changes.set(path, {
				path,
				status: "added",
				added: (
					await this.fs.read(`${this.dir}/${path}`).catch(() => "")
				).split("\n"),
			});
		}
		return {
			base,
			changes: [...changes.values()].sort((left, right) =>
				left.path.localeCompare(right.path),
			),
		};
	}

	private async named(base: string): Promise<Array<[string, Status]>> {
		const out = await this.git(["diff", "--name-status", base]);
		const named: Array<[string, Status]> = [];
		for (const line of out.split("\n")) {
			// `R100\told\tnew` for a rename, so the last field is the path that
			// exists now and the first character is the status.
			const fields = line.split("\t");
			const status = STATUS[fields[0]?.[0] ?? ""];
			const path = fields[fields.length - 1];
			if (status !== undefined && path !== undefined && path !== "") {
				named.push([path, status]);
			}
		}
		return named;
	}

	/** The lines each file gained, out of one diff rather than one per file. */
	private async patch(base: string): Promise<Map<string, string[]>> {
		const out = await this.git(["diff", "--unified=0", base]);
		const added = new Map<string, string[]>();
		let path: string | undefined;
		for (const line of out.split("\n")) {
			if (line.startsWith("+++ ")) {
				// `+++ b/path`, or `+++ /dev/null` for a file the change deletes.
				const named = line.slice(4);
				path = named === "/dev/null" ? undefined : named.replace(/^b\//, "");
				continue;
			}
			// `+++` is handled above, so a line starting with one `+` is content.
			if (path !== undefined && line.startsWith("+")) {
				added.set(path, [...(added.get(path) ?? []), line.slice(1)]);
			}
		}
		return added;
	}

	private async untracked(): Promise<string[]> {
		const out = await this.git(["ls-files", "--others", "--exclude-standard"]);
		return out.split("\n").filter((path) => path !== "");
	}

	private async git(argv: string[]): Promise<string> {
		const { exitCode, stdout, stderr } = await this.ps.spawnCapture([
			"git",
			"-C",
			this.dir,
			...argv,
		]);
		if (exitCode !== 0) {
			throw new Error(
				`git ${argv[0]} failed in ${this.dir}: ${stderr.trim() || `exit ${exitCode}`}`,
			);
		}
		return stdout;
	}
}
