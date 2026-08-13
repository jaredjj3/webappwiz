/** What one task is handed to: the argv to spawn, and how reports name it. */
export interface Agent {
	argv: string[];
	label: string;
}

/**
 * The models `--agent` names, so a run can pick one without a command.
 *
 * `--output-format json` wraps the answer in an envelope that also carries what
 * the call was billed, which is the only place a real dollar figure comes from:
 * there is no price list to fetch, and pricing tokens ourselves would miss the
 * agent's own system prompt, which is most of what a small call costs.
 */
export const AGENTS: Record<string, string[]> = {
	haiku: ["claude", "-p", "--output-format", "json", "--model", "haiku"],
	sonnet: ["claude", "-p", "--output-format", "json", "--model", "sonnet"],
	opus: ["claude", "-p", "--output-format", "json", "--model", "opus"],
};

/** The two ways to say what runs a task, of which a caller passes one. */
export interface AgentOptions {
	/** A model to ask, keyed into `AGENTS`. */
	agent?: string;
	/** A command to hand the prompt to instead. */
	exec?: string;
}

/**
 * Resolves `--agent` and `--exec`, which are alternatives: name a model, or
 * give a command to run it yourself. Throws if you give both, neither, or a
 * model that is not one of `AGENTS`.
 */
export const agentCommand = (opts: AgentOptions): Agent => {
	if (opts.exec !== undefined) {
		if (opts.agent !== undefined) {
			throw new Error("--agent and --exec both name an agent, so pass one");
		}
		// through a shell, so quoting and pipes in the command survive, with the
		// prompt as "$@" rather than spliced into the text of the command
		return { argv: ["sh", "-c", `${opts.exec} "$@"`, "sh"], label: opts.exec };
	}
	if (opts.agent === undefined) {
		// The config's `agent` is where a default comes from, so reaching here
		// means neither the caller nor the config named one. Names no command:
		// this is shared by every caller that spawns an agent, and naming one of
		// them is how the message goes stale.
		throw new Error(
			"a run needs an agent, so say which: --agent " +
				`<${Object.keys(AGENTS).join("|")}>, --exec <command>, ` +
				"or --prompt to print the prompts and run nothing",
		);
	}
	const name = opts.agent;
	const argv = AGENTS[name];
	if (!argv) {
		throw new Error(
			`no agent "${name}". Known agents: ${Object.keys(AGENTS).join(", ")}`,
		);
	}
	return { argv, label: argv.join(" ") };
};
