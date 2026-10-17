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

	it("keeps its slots where splates dev's machine keeps them", async () => {
		const { fs, heavy } = jobs({
			SPLATES_MACHINE_HOME: "/machine",
			SPLATES_HOME: "/slot",
			HOME: "/home",
		});

		await heavy.take({ what: "wiz dev test" });

		expect(await fs.exists("/machine/heavy.json")).toBe(true);
	});

	it("falls back on SPLATES_HOME, then ~/.splates", async () => {
		const slot = jobs({ SPLATES_HOME: "/slot", HOME: "/home" });
		await slot.heavy.take({ what: "wiz dev test" });
		expect(await slot.fs.exists("/slot/heavy.json")).toBe(true);

		const home = jobs({ HOME: "/home" });
		await home.heavy.take({ what: "wiz dev test" });
		expect(await home.fs.exists("/home/.splates/heavy.json")).toBe(true);
	});

	it("still follows the ARBOR_* names splates read before its rename", async () => {
		const { fs, heavy } = jobs({
			ARBOR_MACHINE_HOME: "/machine",
			ARBOR_HEAVY_JOBS: "4",
			HOME: "/home",
		});

		expect((await heavy.read()).cap).toBe(4);
		await heavy.take({ what: "wiz dev test" });
		expect(await fs.exists("/machine/heavy.json")).toBe(true);
	});

	it("reads splates' cap, and runs in the slot a preMerge already holds", async () => {
		const { heavy } = jobs({
			HOME: "/home",
			SPLATES_HEAVY_JOBS: "3",
			SPLATES_HEAVY: "7-0",
		});

		expect((await heavy.read()).cap).toBe(3);
		expect((await heavy.take({ what: "wiz dev test" })).env).toEqual({});
	});

	it("runs in a slot held under the old ARBOR_HEAVY name", async () => {
		const { heavy } = jobs({ HOME: "/home", ARBOR_HEAVY: "7-0" });

		expect((await heavy.take({ what: "wiz dev test" })).env).toEqual({});
	});
});
