import { describe, expect, it } from "bun:test";
import { vocabulary } from "./vocabulary";

describe("vocabulary", () => {
	it("names every system and alias after the project's own words", () => {
		expect(
			vocabulary({
				board: { aliases: ["todos", "lanes"], globs: [] },
				scry: { globs: [] },
			}),
		).toBe(
			"A developer dictating a prompt for a coding agent. Words that may come up: webappwiz, wiz, arbor, scry, board, todos, lanes.",
		);
	});
});
