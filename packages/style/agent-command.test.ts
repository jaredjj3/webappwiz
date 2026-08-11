import { describe, expect, it } from "bun:test";
import { agentCommand } from "./analyze";

describe("agentCommand", () => {
	it("spawns claude directly for a model shorthand", () => {
		expect(agentCommand({ agent: "haiku" })).toEqual({
			argv: ["claude", "-p", "--model", "haiku"],
			label: "claude -p --model haiku",
		});
	});

	it("refuses to pick an agent when nothing names one", () => {
		expect(() => agentCommand({})).toThrow(
			"analyze runs an agent, so say which: --agent <haiku|sonnet|opus>, " +
				"--exec <command>, or --prompt to print the prompts and run nothing",
		);
	});

	it("keeps the quoting in a command by running it through a shell", () => {
		expect(agentCommand({ exec: 'my-agent --system "be terse"' })).toEqual({
			argv: ["sh", "-c", 'my-agent --system "be terse" "$@"', "sh"],
			label: 'my-agent --system "be terse"',
		});
	});

	it("refuses a model and a command at once", () => {
		expect(() => agentCommand({ agent: "haiku", exec: "codex exec" })).toThrow(
			"--agent and --exec both name an agent, so pass one",
		);
	});

	it("lists the models it knows when named one it does not", () => {
		expect(() => agentCommand({ agent: "gpt" })).toThrow(
			'no agent "gpt". Known agents: haiku, sonnet, opus',
		);
	});
});
