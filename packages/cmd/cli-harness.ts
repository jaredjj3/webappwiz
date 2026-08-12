import { color, MemoryLogger } from "@webappwiz/log";
import { type Cli, cli } from "./cli";

/** Two programs for the help tests, both writing to the same logger. */
export class CliHarness {
	readonly log = new MemoryLogger();
	/** One command under a group, for the help a group prints. */
	readonly wiz: Cli;
	/** One command at the top level, for the help the program prints. */
	readonly plain: Cli;

	constructor() {
		this.wiz = cli("wiz", this.log);
		this.wiz
			.group("skills")
			.description("manage skills")
			.command("add")
			.description("add one");

		this.plain = cli("wiz", this.log);
		this.plain
			.command("a")
			.description("does a")
			.action(() => {});
	}

	/** Everything written to the logger so far, uncoloured, as one string. */
	help(): string {
		return this.log.entries
			.map((entry) => color.strip(entry.message))
			.join("\n");
	}
}
