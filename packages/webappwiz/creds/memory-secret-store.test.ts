import { beforeEach, describe, expect, it } from "bun:test";
import { inspect } from "node:util";
import { Credentials } from "./credentials";
import { MemorySecretStore } from "./memory-secret-store";

const KEY = "sk-memory-only-0123456789";

describe("MemorySecretStore", () => {
	let store: MemorySecretStore;

	beforeEach(async () => {
		store = new MemorySecretStore();
		await store.set("API_KEY", KEY);
		await store.set("OTHER_KEY", "sk-other");
	});

	it("keeps, lists and deletes values", async () => {
		expect(await store.get("API_KEY")).toEqual(KEY);
		expect(await store.names()).toEqual(["API_KEY", "OTHER_KEY"]);
		expect(await store.delete("API_KEY")).toBe(true);
		expect(await store.delete("API_KEY")).toBe(false);
		expect(await store.names()).toEqual(["OTHER_KEY"]);
	});

	it("drops every value at once on clear", async () => {
		store.clear();

		expect(await store.names()).toEqual([]);
		expect(await store.get("API_KEY")).toBeUndefined();
	});

	it("drops every value once disposed", async () => {
		store.dispose();

		expect(await store.names()).toEqual([]);
	});

	it("refuses a name no environment could hold, without the value", async () => {
		const refused = await store.set("not a name", KEY).catch(String);

		expect(refused).toContain("is not an environment variable name");
		expect(refused).not.toContain(KEY);
	});

	it("never shows a value when printed, serialized or missing", async () => {
		const missing = await new Credentials([store])
			.require("MISSING_KEY")
			.catch(String);

		const shown = [
			store.label,
			Bun.inspect(store),
			inspect(store, { showHidden: true, depth: 10 }),
			JSON.stringify(store),
			String(store),
			missing,
		].join("\n");

		expect(shown).not.toContain(KEY);
		expect(JSON.stringify(store)).toEqual(
			'{"label":"this process\'s memory","names":["API_KEY","OTHER_KEY"]}',
		);
	});

	it("never puts a value in the environment", () => {
		expect(Object.values(process.env)).not.toContain(KEY);
	});
});
