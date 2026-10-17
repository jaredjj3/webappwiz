import { describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs, FakePs } from "webappwiz/system/testing";
import { machineHeavyJobs } from "./heavy";

describe("machineHeavyJobs", () => {
	const jobs = (env: Record<string, string>) => {
		const fs = new FakeFs();
		const ps = new FakePs();
		ps.setEnv(env);
		return { fs, heavy: machineHeavyJobs({ fs, ps, log: new MemoryLogger() }) };
	};

	it("keeps its slots where arbor dev's machine keeps them", async () => {
		const { fs, heavy } = jobs({
			ARBOR_MACHINE_HOME: "/machine",
			ARBOR_HOME: "/slot",
			HOME: "/home",
		});

		await heavy.take({ what: "wiz dev test" });

		expect(await fs.exists("/machine/heavy.json")).toBe(true);
	});

	it("falls back on ARBOR_HOME, then ~/.arbor", async () => {
		const slot = jobs({ ARBOR_HOME: "/slot", HOME: "/home" });
		await slot.heavy.take({ what: "wiz dev test" });
		expect(await slot.fs.exists("/slot/heavy.json")).toBe(true);

		const home = jobs({ HOME: "/home" });
		await home.heavy.take({ what: "wiz dev test" });
		expect(await home.fs.exists("/home/.arbor/heavy.json")).toBe(true);
	});

	it("reads arbor's cap, and runs in the slot a preMerge already holds", async () => {
		const { heavy } = jobs({
			HOME: "/home",
			ARBOR_HEAVY_JOBS: "3",
			ARBOR_HEAVY: "7-0",
		});

		expect((await heavy.read()).cap).toBe(3);
		expect((await heavy.take({ what: "wiz dev test" })).env).toEqual({});
	});
});
