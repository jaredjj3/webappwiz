import type { Agent, AskObserver, AskOptions } from "@webappwiz/scry";
import { NodePs, type Ps } from "webappwiz/system";
import { SniffingReader } from "./sniffing-reader";

/** Where a command agent runs, and for how long at most. */
export interface CommandAgentOptions {
	/** The project root, the command's working directory. */
	dir: string;
	ps?: Ps;
	/** Ten minutes when not given. */
	timeoutMs?: number;
}

const UNHEARD: AskObserver = {
	status: () => undefined,
	usage: () => undefined,
};

/**
 * An agent behind a shell command: the prompt goes in on stdin and the reply
 * comes out on stdout, so it can be any agent CLI or model runner. What it
 * prints decides how much it can say as it works; see `SniffingReader`.
 */
export class CommandAgent implements Agent {
	private ps: Ps;

	constructor(
		private command: string,
		private opts: CommandAgentOptions,
	) {
		this.ps = opts.ps ?? new NodePs();
	}

	async ask(prompt: string, opts: AskOptions = {}): Promise<string> {
		const observer = opts.observer ?? UNHEARD;
		const reader = new SniffingReader(observer);
		observer.status("waiting");
		const { exitCode, stdout, stderr } = await this.ps.spawnCapture(
			["sh", "-c", this.command],
			{
				cwd: this.opts.dir,
				stdin: prompt,
				timeoutMs: this.opts.timeoutMs ?? 600_000,
				signal: opts.signal,
				watcher: reader,
			},
		);
		if (exitCode !== 0) {
			const said = stderr.trim().split("\n").at(-1);
			throw new Error(
				`\`${this.command}\` exited ${exitCode}${said ? `: ${said}` : ""}`,
			);
		}
		return reader.reply(stdout);
	}
}
