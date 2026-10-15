import { describe, expect, it } from "bun:test";
import { vocabulary, words } from "./vocabulary";

describe("vocabulary", () => {
	it("lists each word once: the project's own, then every system and alias", () => {
		expect(
			words({ arbor: { aliases: ["todos"], globs: [] }, scry: { globs: [] } }),
		).toEqual(["webappwiz", "wiz", "arbor", "scry", "todos"]);
	});

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
