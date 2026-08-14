import { beforeEach, describe, expect, it } from "bun:test";

import { FakePs } from "../testing";
import { DarwinIpProvider } from "./darwin-ip-provider";

describe("DarwinIpProvider", () => {
	let ps: FakePs;

	beforeEach(() => {
		ps = new FakePs();
	});

	it("reads the trimmed address from ipconfig", async () => {
		ps.setCaptureOutput("192.168.1.42\n", "");

		expect(await new DarwinIpProvider({ ps: ps }).get()).toBe("192.168.1.42");
		expect(ps.getCalls()).toEqual(["ipconfig getifaddr en0"]);
	});

	it("rejects instead of returning an empty address when the output is blank", async () => {
		ps.setCaptureOutput("  \n", "");

		expect(new DarwinIpProvider({ ps: ps }).get()).rejects.toThrow(
			"no IP address found",
		);
	});

	it("rejects when the command exits non-zero", async () => {
		ps.exit(1);
		ps.setCaptureOutput("192.168.1.42", "");

		expect(new DarwinIpProvider({ ps: ps }).get()).rejects.toThrow(
			"failed to get",
		);
	});
});
