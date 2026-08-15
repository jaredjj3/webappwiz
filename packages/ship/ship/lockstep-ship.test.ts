import { describe, expect, it } from "bun:test";
import { FakeRelease } from "../release/fake-release";
import { FakeShip } from "./fake-ship";
import { LockstepShip } from "./lockstep-ship";

describe("lockstep ship", () => {
	it("gathers every package its steps publish", () => {
		const ship = new LockstepShip(
			new FakeShip(["@scope/one"]),
			new FakeShip(["@scope/two"]),
			new FakeShip(),
		);

		expect(ship.packages).toEqual(["@scope/one", "@scope/two"]);
	});

	it("runs every step in the one release", async () => {
		const [one, two] = [new FakeShip(["@scope/one"]), new FakeShip()];
		const release = new FakeRelease();

		await new LockstepShip(one, two).run(release);

		expect(one.runs).toEqual([release]);
		expect(two.runs).toEqual([release]);
	});
});
