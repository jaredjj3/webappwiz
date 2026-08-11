import { beforeEach, describe, expect, it } from "bun:test";

import { FakePs } from "../testing";
import { LinuxIpProvider } from "./linux-ip-provider";

describe("LinuxIpProvider", () => {
	let ps: FakePs;

	beforeEach(() => {
		ps = new FakePs();
	});

	it("takes the first address hostname -I prints", async () => {
		ps.platform = "linux";
		ps.setCaptureOutput("10.0.0.5 10.0.0.6 \n", "");

		expect(await new LinuxIpProvider(ps).get()).toBe("10.0.0.5");
	});

	it("throws when constructed on another platform", () => {
		expect(() => new LinuxIpProvider(ps)).toThrow("only supported on Linux");
	});
});
