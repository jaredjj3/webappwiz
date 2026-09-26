import { describe, expect, it } from "bun:test";
import type { Usage } from "@webappwiz/scry";
import { NodePs } from "webappwiz/system";
import { CommandAgent } from "./agent";

describe("CommandAgent", () => {
	const ps = new NodePs();
	const listen = () => {
		const heard = { statuses: [] as string[], usage: [] as Usage[] };
		return {
			heard,
			observer: {
				status: (status: string) => {
					heard.statuses.push(status);
				},
				usage: (usage: Usage) => {
					heard.usage.push(usage);
				},
			},
		};
	};

	it("sends the prompt on stdin and answers with stdout, saying what it heard on stderr", async () => {
		const agent = new CommandAgent("echo working >&2; cat", { dir: ".", ps });
		const { heard, observer } = listen();

		expect(await agent.ask("the prompt", { observer })).toEqual("the prompt");
		expect(heard.statuses).toContain("waiting");
		expect(heard.statuses).toContain("working");
		expect(heard.statuses.indexOf("working")).toBeLessThan(
			heard.statuses.indexOf("reading ~3 tokens"),
		);
	});

	it("reads the reply and usage from Claude Code's JSON output, unasked", async () => {
		const result = JSON.stringify({
			type: "result",
			subtype: "success",
			is_error: false,
			result: "[]",
			usage: { input_tokens: 5, output_tokens: 2 },
		});
		const agent = new CommandAgent(`cat > /dev/null; echo '${result}'`, {
			dir: ".",
			ps,
		});
		const { heard, observer } = listen();

		expect(await agent.ask("the prompt", { observer })).toEqual("[]");
		expect(heard.usage).toEqual([{ input: 5, cached: 0, output: 2 }]);
	});

	it("fails with the command and the last thing it said when it exits nonzero", async () => {
		const agent = new CommandAgent("echo broke >&2; exit 3", { dir: ".", ps });

		await expect(agent.ask("x")).rejects.toThrow(
			"`echo broke >&2; exit 3` exited 3: broke",
		);
	});
});
