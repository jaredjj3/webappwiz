import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFs, NodePs } from "webappwiz/system";
import { FakeFs, FakeProcess, FakePs } from "webappwiz/system/testing";
import type { CredentialSource } from "./credential-source";
import { Credentials } from "./credentials";
import { DotenvFile } from "./dotenv-file";
import { Environment } from "./environment";
import { FakeSecretStore } from "./fake-secret-store";
import { SystemSecretStore } from "./system-secret-store";

describe("Credentials", () => {
	let ps: FakePs;
	let store: FakeSecretStore;

	beforeEach(() => {
		ps = new FakePs();
		store = new FakeSecretStore({ API_TOKEN: "from-store" });
	});

	it("reads its sources in the order given, first value wins", async () => {
		ps.setEnv({ API_TOKEN: "from-env" });
		const environment = new Environment({ ps });

		const envFirst = new Credentials([environment, store]);
		const storeFirst = new Credentials([store, environment]);

		expect(await envFirst.get("API_TOKEN")).toEqual("from-env");
		expect(await envFirst.source("API_TOKEN")).toBe(environment);
		expect(await storeFirst.get("API_TOKEN")).toEqual("from-store");
		expect(await storeFirst.source("API_TOKEN")).toBe(store);
	});

	it("passes over an empty value to the next source", async () => {
		ps.setEnv({ API_TOKEN: "" });
		const credentials = new Credentials([new Environment({ ps }), store]);

		expect(await credentials.get("API_TOKEN")).toEqual("from-store");
	});

	it("never reads a source it was not given", async () => {
		ps.setEnv({ API_TOKEN: "from-env" });
		const credentials = new Credentials([new FakeSecretStore()]);

		expect(await credentials.get("API_TOKEN")).toBeUndefined();
	});

	it("says where it looked for one no source has, and never a value", async () => {
		const credentials = new Credentials([new Environment({ ps }), store]);

		expect(await credentials.get("OTHER")).toBeUndefined();
		expect(await credentials.source("OTHER")).toBeUndefined();
		await expect(credentials.require("OTHER")).rejects.toThrow(
			"OTHER is not set in the environment, or a fake store",
		);
	});
});

describe("composing Credentials", () => {
	it("takes a group of sources, or a source of its own, as one entry in another list", async () => {
		const ps = new FakePs();
		ps.setEnv({ FROM_ENV: "env" });
		const vault: CredentialSource = {
			label: "the team vault",
			get: async (name) => (name === "FROM_VAULT" ? "vault" : undefined),
		};
		const local = new Credentials([
			new FakeSecretStore({ FROM_STORE: "store" }, "the project's store"),
		]);
		const credentials = new Credentials([
			local,
			new Credentials([new Environment({ ps }), vault]),
		]);

		expect(await credentials.get("FROM_STORE")).toEqual("store");
		expect(await credentials.get("FROM_ENV")).toEqual("env");
		expect(await credentials.get("FROM_VAULT")).toEqual("vault");
		expect(await credentials.source("FROM_VAULT")).not.toBe(local);
		await expect(credentials.require("NONE")).rejects.toThrow(
			"NONE is not set in the project's store, or the environment, or the team vault",
		);
	});
});

describe("DotenvFile", () => {
	it("reads NAME=value lines, quoted or bare, with comments and export", async () => {
		const fs = new FakeFs();
		await fs.mkdir("/app");
		await fs.write(
			"/app/.env",
			[
				"# a comment",
				"BARE=plain value # trailing",
				'DOUBLE="has # and \\"quotes\\"\\nand a newline"',
				"SINGLE='kept $AS is'",
				"export EXPORTED=yes",
				"EMPTY=",
				"not a line",
			].join("\n"),
		);
		const file = new DotenvFile("/app/.env", { fs });

		expect(await file.get("BARE")).toEqual("plain value");
		expect(await file.get("DOUBLE")).toEqual(
			'has # and "quotes"\nand a newline',
		);
		expect(await file.get("SINGLE")).toEqual("kept $AS is");
		expect(await file.get("EXPORTED")).toEqual("yes");
		expect(await file.get("EMPTY")).toBeUndefined();
		expect(file.label).toEqual("/app/.env");
	});

	it("has nothing when the file is missing", async () => {
		const file = new DotenvFile("/app/.env", { fs: new FakeFs() });

		expect(await file.get("ANY")).toBeUndefined();
	});
});

describe("SystemSecretStore.forProject", () => {
	const fs = new NodeFs();
	let root: string;
	let proc: FakeProcess;
	let ps: NodePs;
	const git = (...args: string[]) =>
		ps.spawnCapture(["git", "-C", `${root}/shop`, ...args]);

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "creds-project-"));
		proc = new FakeProcess();
		proc.env = { PATH: process.env.PATH, HOME: root };
		ps = new NodePs({ proc });
		await fs.mkdir(`${root}/shop`);
		await git("init", "-q", "-b", "main");
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("names the project after its main worktree, so every worktree shares one store", async () => {
		await fs.write(`${root}/shop/README.md`, "shop\n");
		await git("add", ".");
		await git(
			"-c",
			"user.email=t@example.com",
			"-c",
			"user.name=T",
			"commit",
			"-qm",
			"base",
		);
		await git("worktree", "add", "-q", `${root}/shop-task`);

		const store = await SystemSecretStore.forProject(`${root}/shop-task`, {
			fs,
			ps,
		});

		expect(store.service).toEqual("webappwiz:shop");
	});

	it("takes the project's configured name, and the user's over it", async () => {
		await fs.mkdir(`${root}/shop/.wiz`);
		await fs.write(
			`${root}/shop/.wiz/config.ts`,
			'export default { credentials: { project: "store-front" } };\n',
		);

		expect(
			(await SystemSecretStore.forProject(`${root}/shop`, { fs, ps })).service,
		).toEqual("webappwiz:store-front");

		await fs.mkdir(`${root}/.config/wiz`);
		await fs.write(
			`${root}/.config/wiz/config.ts`,
			'export default { credentials: { project: "jared" } };\n',
		);

		expect(
			(await SystemSecretStore.forProject(`${root}/shop`, { fs, ps })).service,
		).toEqual("webappwiz:jared");
	});

	it("keeps the device's values apart from every project's", () => {
		expect(SystemSecretStore.device().service).toEqual("webappwiz");
	});
});
