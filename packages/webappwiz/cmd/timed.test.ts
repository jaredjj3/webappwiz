import { beforeEach, describe, expect, it } from "bun:test";
import { color, MemoryLogger } from "webappwiz/log";
import { FakePs } from "webappwiz/system/testing";
import { Duration } from "webappwiz/time";
import { FakeClock } from "webappwiz/time/testing";
import { type Cli, cli } from "./cli";
import { timed } from "./timed";

describe("timed", () => {
	let log: MemoryLogger;
	let ps: FakePs;
	let clock: FakeClock;
	let app: Cli;

	beforeEach(() => {
		log = new MemoryLogger();
		ps = new FakePs();
		clock = new FakeClock();
		app = cli("app");
	});

	const errors = () =>
		log.entries
			.filter((entry) => entry.level === "error")
			.map((entry) => color.strip(String(entry.message)));

	it("says how long the command took as the process ends", async () => {
		app
			.command("go")
			.use(timed(clock))
			.action(() => clock.advance(Duration.secs(72)));

		await app.run({ log, ps }, ["go"]);
		expect(errors()).toEqual([]);
		ps.exit(0);

		expect(errors()).toEqual(["done in 1m 12s"]);
	});

	it("still says it when the command ends the process itself", async () => {
		app
			.command("go")
			.use(timed(clock))
			.action(() => {
				clock.advance(Duration.ms(2500));
				ps.exit(1);
			});

		await app.run({ log, ps }, ["go"]);

		expect(errors()).toEqual(["done in 2.5s"]);
	});
});
