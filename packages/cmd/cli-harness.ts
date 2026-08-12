import { color, MemoryLogger } from "@webappwiz/log";
import { type Cli, cli } from "./cli";

/** A program whose one command sits under a group, for the help tests. */
export class CliHarness {
	readonly log = new MemoryLogger();
	readonly wiz: Cli;

	constructor() {
		this.wiz = cli("wiz", this.log);
		this.wiz
			.group("skills")
			.description("manage skills")
			.command("add")
			.description("add one");
	}

	/** Everything written to the logger so far, uncoloured, as one string. */
	help(): string {
		return this.log.entries
			.map((entry) => color.strip(entry.message))
			.join("\n");
	}
}
