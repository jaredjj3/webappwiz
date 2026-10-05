import { beforeEach, describe, expect, it } from "bun:test";
import { FakePs } from "webappwiz/system/testing";
import { Credentials } from "./credentials";
import { FakeSecretStore } from "./fake-secret-store";

describe("Credentials", () => {
	let ps: FakePs;
	let store: FakeSecretStore;
	let credentials: Credentials;

	beforeEach(() => {
		ps = new FakePs();
		store = new FakeSecretStore({ API_TOKEN: "from-store" });
		credentials = new Credentials(store, { ps });
	});

	it("reads the environment before the store", async () => {
		ps.setEnv({ API_TOKEN: "from-env" });

		expect(await credentials.get("API_TOKEN")).toEqual("from-env");
		expect(await credentials.source("API_TOKEN")).toEqual("environment");
	});

	it("falls back to the store when the environment has none, or an empty one", async () => {
		ps.setEnv({ API_TOKEN: "" });

		expect(await credentials.get("API_TOKEN")).toEqual("from-store");
		expect(await credentials.source("API_TOKEN")).toEqual("store");
	});

	it("says a credential neither has is missing, and how a person sets it", async () => {
		expect(await credentials.get("OTHER")).toBeUndefined();
		expect(await credentials.source("OTHER")).toEqual("missing");
		await expect(credentials.require("OTHER")).rejects.toThrow(
			"OTHER is not set: ask a person to run `bunx @webappwiz/cli creds add OTHER`, or set it in the environment",
		);
	});

	it("adds to and removes from the store", async () => {
		await credentials.add("OTHER", "secret");
		const removed = await credentials.remove("API_TOKEN");

		expect(store.values).toEqual(new Map([["OTHER", "secret"]]));
		expect(removed).toBe(true);
		expect(await credentials.remove("API_TOKEN")).toBe(false);
	});
});
