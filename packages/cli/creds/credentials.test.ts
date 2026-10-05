import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeSecretStore } from "webappwiz/credentials/testing";
import { color, MemoryLogger } from "webappwiz/log";
import { NodeFs, NodePs } from "webappwiz/system";
import { FakeProcess } from "webappwiz/system/testing";
import { add } from "./add";
import { list } from "./list";
import { ProjectCredentials } from "./project-credentials";
import { remove } from "./remove";
import type { SecretInput } from "./secret-input";

describe("wiz creds", () => {
	const fs = new NodeFs();
	let root: string;
	let proc: FakeProcess;
	let ps: NodePs;
	let log: MemoryLogger;
	let store: FakeSecretStore;
	let typed: string | undefined;
	let asked: string[];
	const input: SecretInput = {
		hidden: async (question) => {
			asked.push(question);
			return typed;
		},
		piped: async () => "piped-value\n",
	};

	const printed = () =>
		color.strip(
			log.entries
				.filter((entry) => entry.level === "info")
				.map((entry) => String(entry.message))
				.join("\n"),
		);
	const git = (...args: string[]) =>
		ps.spawnCapture(["git", "-C", `${root}/shop`, ...args]);

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "wiz-credentials-"));
		proc = new FakeProcess();
		proc.env = { PATH: process.env.PATH, HOME: root };
		ps = new NodePs({ proc });
		log = new MemoryLogger();
		store = new FakeSecretStore();
		typed = "typed-value";
		asked = [];
		await fs.mkdir(`${root}/shop/.wiz`);
		await fs.write(
			`${root}/shop/.wiz/config.ts`,
			'export default { credentials: { names: { STRIPE_SECRET_KEY: "Stripe, for checkout" } } };\n',
		);
		await git("init", "-q", "-b", "main");
		proc.chdir(`${root}/shop`);
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("lists every credential wiz and the project use, where each comes from, and never a value", async () => {
		store.values.set("STRIPE_SECRET_KEY", "sk_live_secret");
		proc.env.TYPESAFE_API_KEY = "ts_secret";

		await list({ log, ps, store });

		expect(printed()).toEqual(
			[
				'project shop, saved in a fake store as "webappwiz:shop"',
				"CLOUDFLARE_ACCOUNT_ID   missing       Workers AI, for scry's clef and clef-flash",
				"CLOUDFLARE_API_TOKEN    missing       Workers AI, for scry's clef and clef-flash",
				"STRIPE_SECRET_KEY       store         Stripe, for checkout",
				"TYPESAFE_API_KEY        environment   TypeSafe, for scry's jev models",
			].join("\n"),
		);
	});

	it("keeps what a person types at a hidden prompt", async () => {
		await add({
			name: "STRIPE_SECRET_KEY",
			stdin: false,
			log,
			ps,
			store,
			input,
		});

		expect(asked).toEqual(["STRIPE_SECRET_KEY: "]);
		expect(store.values.get("STRIPE_SECRET_KEY")).toEqual("typed-value");
		expect(printed()).toEqual(
			"saved STRIPE_SECRET_KEY to a fake store for the shop project",
		);
	});

	it("keeps a value piped in when asked to, trimmed", async () => {
		await add({
			name: "STRIPE_SECRET_KEY",
			stdin: true,
			log,
			ps,
			store,
			input,
		});

		expect(store.values.get("STRIPE_SECRET_KEY")).toEqual("piped-value");
	});

	it("refuses with no terminal to ask on, and says a person has to run it", async () => {
		typed = undefined;

		await expect(
			add({ name: "STRIPE_SECRET_KEY", stdin: false, log, ps, store, input }),
		).rejects.toThrow(
			"no terminal to ask for STRIPE_SECRET_KEY on: ask a person to run `bunx @webappwiz/cli creds add STRIPE_SECRET_KEY` themselves",
		);
		expect(store.values.size).toEqual(0);
	});

	it("refuses a name the project does not use, before asking for a value", async () => {
		await expect(
			add({ name: "STRIPE_SECRET", stdin: false, log, ps, store, input }),
		).rejects.toThrow(
			"STRIPE_SECRET is not a credential this project uses: name it in .wiz/config.ts under credentials.names",
		);
		expect(asked).toEqual([]);
	});

	it("removes a kept value, and says when there was none", async () => {
		store.values.set("STRIPE_SECRET_KEY", "sk_live_secret");

		await remove({ name: "STRIPE_SECRET_KEY", log, ps, store });
		await remove({ name: "STRIPE_SECRET_KEY", log, ps, store });

		expect(printed()).toEqual(
			[
				"deleted STRIPE_SECRET_KEY from a fake store for the shop project",
				"STRIPE_SECRET_KEY was not in a fake store for the shop project",
			].join("\n"),
		);
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

		const project = await ProjectCredentials.open(`${root}/shop-task`, {
			fs,
			ps,
			store,
		});

		expect(project.project).toEqual("shop");
		expect([...project.names.keys()]).toContain("STRIPE_SECRET_KEY");
	});
});
