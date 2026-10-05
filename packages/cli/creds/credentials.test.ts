import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeSecretStore } from "webappwiz/creds/testing";
import { color, MemoryLogger } from "webappwiz/log";
import { NodeFs, NodePs } from "webappwiz/system";
import { FakeProcess } from "webappwiz/system/testing";
import { add } from "./add";
import { list } from "./list";
import { ProjectCredentials } from "./project-credentials";
import { remove } from "./remove";
import { run } from "./run";
import type { SecretInput } from "./secret-input";

describe("wiz creds", () => {
	const fs = new NodeFs();
	let root: string;
	let proc: FakeProcess;
	let ps: NodePs;
	let log: MemoryLogger;
	let store: FakeSecretStore;
	let device: FakeSecretStore;
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
		store = new FakeSecretStore({}, "the project's store");
		device = new FakeSecretStore({}, "the device's store");
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
		device.values.set("CLOUDFLARE_API_TOKEN", "cf_secret");
		proc.env.TYPESAFE_API_KEY = "ts_secret";

		await list({ log, ps, store, deviceStore: device });

		expect(printed()).toEqual(
			[
				"project: the project's store",
				"device:  the device's store",
				"CLOUDFLARE_ACCOUNT_ID   missing       Workers AI, for scry's clef and clef-flash",
				"CLOUDFLARE_API_TOKEN    device        Workers AI, for scry's clef and clef-flash",
				"STRIPE_SECRET_KEY       project       Stripe, for checkout",
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
			deviceStore: device,
			input,
		});

		expect(asked).toEqual(["STRIPE_SECRET_KEY: "]);
		expect(store.values.get("STRIPE_SECRET_KEY")).toEqual("typed-value");
		expect(printed()).toEqual("saved STRIPE_SECRET_KEY to the project's store");
	});

	it("keeps a value piped in when asked to, trimmed", async () => {
		await add({
			name: "STRIPE_SECRET_KEY",
			stdin: true,
			log,
			ps,
			store,
			deviceStore: device,
			input,
		});

		expect(store.values.get("STRIPE_SECRET_KEY")).toEqual("piped-value");
	});

	it("refuses with no terminal to ask on, and says a person has to run it", async () => {
		typed = undefined;

		await expect(
			add({
				name: "STRIPE_SECRET_KEY",
				stdin: false,
				log,
				ps,
				store,
				deviceStore: device,
				input,
			}),
		).rejects.toThrow(
			"no terminal to ask for STRIPE_SECRET_KEY on: ask a person to run `bunx @webappwiz/cli creds add STRIPE_SECRET_KEY` themselves",
		);
		expect(store.values.size).toEqual(0);
	});

	it("refuses a name the project does not use, before asking for a value", async () => {
		await expect(
			add({
				name: "STRIPE_SECRET",
				stdin: false,
				log,
				ps,
				store,
				deviceStore: device,
				input,
			}),
		).rejects.toThrow(
			"STRIPE_SECRET is not a credential this project uses: name it in .wiz/config.ts under credentials.names",
		);
		expect(asked).toEqual([]);
	});

	it("removes a kept value, and says when there was none", async () => {
		store.values.set("STRIPE_SECRET_KEY", "sk_live_secret");

		await remove({
			name: "STRIPE_SECRET_KEY",
			log,
			ps,
			store,
			deviceStore: device,
		});
		await remove({
			name: "STRIPE_SECRET_KEY",
			log,
			ps,
			store,
			deviceStore: device,
		});

		expect(printed()).toEqual(
			[
				"deleted STRIPE_SECRET_KEY from the project's store",
				"STRIPE_SECRET_KEY was not in the project's store",
			].join("\n"),
		);
	});

	it("keeps one for every project in the device's store, and warns when the project's wins", async () => {
		store.values.set("STRIPE_SECRET_KEY", "sk_project");

		await add({
			name: "STRIPE_SECRET_KEY",
			stdin: false,
			device: true,
			log,
			ps,
			store,
			deviceStore: device,
			input,
		});

		expect(device.values.get("STRIPE_SECRET_KEY")).toEqual("typed-value");
		expect(printed()).toEqual("saved STRIPE_SECRET_KEY to the device's store");
		expect(log.entries.at(-1)?.message).toEqual(
			"STRIPE_SECRET_KEY is also in the project's store, which wiz reads first",
		);
	});

	it("reads the project's config from anywhere in the repository", async () => {
		await fs.mkdir(`${root}/shop/src`);
		proc.chdir(`${root}/shop/src`);

		const project = await ProjectCredentials.open(ps.cwd(), {
			fs,
			ps,
			store,
			deviceStore: device,
		});

		expect([...project.names.keys()]).toContain("STRIPE_SECRET_KEY");
	});
	it("runs a command with what the stores keep, never an export they lack, and exits with its code", async () => {
		store.values.set("STRIPE_SECRET_KEY", "sk_project");
		device.values.set("CLOUDFLARE_API_TOKEN", "cf_device");
		proc.env.CLOUDFLARE_API_TOKEN = "cf_exported";
		proc.env.TYPESAFE_API_KEY = "ts_exported";

		await run({
			command: [
				"sh",
				"-c",
				'printf "%s %s %s" "$STRIPE_SECRET_KEY" "$CLOUDFLARE_API_TOKEN" "$TYPESAFE_API_KEY" > seen; exit 3',
			],
			log,
			ps,
			store,
			deviceStore: device,
		});

		expect(await fs.read(`${root}/shop/seen`)).toEqual("sk_project cf_device ");
		expect(proc.lastExit()).toEqual(3);
		expect(log.entries.at(-1)?.message).toEqual(
			"not in either store, so sh runs without them: CLOUDFLARE_ACCOUNT_ID, TYPESAFE_API_KEY",
		);
	});

	it("refuses to run nothing", async () => {
		await expect(
			run({ command: [], log, ps, store, deviceStore: device }),
		).rejects.toThrow("no command to run");
	});
});
