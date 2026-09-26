import { describe, expect, it } from "bun:test";
import { color, MemoryLogger } from "webappwiz/log";
import { FakePs } from "webappwiz/system/testing";
import { Duration } from "webappwiz/time";
import { FakeClock } from "webappwiz/time/testing";
import { cli } from "./cli";
import { timed } from "./timed";

describe("timed", () => {
	const errors = (log: MemoryLogger) =>
		log.entries
			.filter((entry) => entry.level === "error")
			.map((entry) => color.strip(String(entry.message)));

	it("says how long the command took as the process ends", async () => {
		const log = new MemoryLogger();
		const ps = new FakePs();
		const clock = new FakeClock();
		const app = cli("app");
		app
			.command("go")
			.use(timed(clock))
			.action(() => clock.advance(Duration.secs(72)));

		await app.run({ log, ps }, ["go"]);
		expect(errors(log)).toEqual([]);
		ps.exit(0);

		expect(errors(log)).toEqual(["done in 1m 12s"]);
	});

	it("still says it when the command ends the process itself", async () => {
		const log = new MemoryLogger();
		const ps = new FakePs();
		const clock = new FakeClock();
		const app = cli("app");
		app
			.command("go")
			.use(timed(clock))
			.action(() => {
				clock.advance(Duration.ms(2500));
				ps.exit(1);
			});

		await app.run({ log, ps }, ["go"]);

		expect(errors(log)).toEqual(["done in 2.5s"]);
	});
});
