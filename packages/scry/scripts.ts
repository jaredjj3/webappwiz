import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";

/** A place a script says is worth a look: `file:line: message`. */
export interface Candidate {
	file: string;
	line: number;
	message: string;
}

/** What `Scripts` reads and spawns through; the real ones by default. */
export interface ScriptsOptions {
	fs?: Fs;
	ps?: Ps;
}

const CANDIDATE = /^(.+?):(\d+): (.+)$/;

/**
 * Runs the scripts rules carry. A script is run by the interpreter its `#!`
 * line names, so it needs no executable bit and survives being copied by a
 * tool that does not keep one.
 */
export class Scripts {
	private fs: Fs;
	private ps: Ps;

	constructor(
		/** The project root, which script and file paths are relative to. */
		private dir: string,
		opts: ScriptsOptions = {},
	) {
		this.fs = opts.fs ?? new NodeFs();
		this.ps = opts.ps ?? new NodePs();
	}

	/**
	 * The candidates `script` prints for `files`. Throws when it has no `#!`
	 * line or exits nonzero, since a script that failed has said nothing about
	 * the files, not that they are fine.
	 */
	async run(script: string, files: string[]): Promise<Candidate[]> {
		const text = await this.fs.read(`${this.dir}/${script}`);
		const shebang = text.match(/^#!(.+)$/m);
		if (!text.startsWith("#!") || !shebang?.[1]) {
			throw new Error(`${script} has no #! line naming what runs it`);
		}
		const interpreter = shebang[1].trim().split(/\s+/);
		const { exitCode, stdout, stderr } = await this.ps.spawnCapture(
			[...interpreter, script, ...files],
			{ cwd: this.dir },
		);
		if (exitCode !== 0) {
			throw new Error(
				`${script} exited ${exitCode}${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
			);
		}
		return stdout.split("\n").flatMap((line) => {
			const [, file, at, message] = line.match(CANDIDATE) ?? [];
			return file && at && message ? [{ file, line: Number(at), message }] : [];
		});
	}
}
