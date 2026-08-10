import { beforeEach, describe, expect, it } from "bun:test";

import {
	DarwinIpProvider,
	LinuxIpProvider,
	PlatformIpProvider,
	SequentialIpProvider,
	StaticIpProvider,
} from "../index";
import { FakePs } from "../testing";

describe("IpProvider", () => {
	let ps: FakePs;

	beforeEach(() => {
		ps = new FakePs();
	});

	it("darwin provider reads the trimmed address from ipconfig", async () => {
		ps.setCaptureOutput("192.168.1.42\n", "");

		expect(await new DarwinIpProvider(ps).get()).toBe("192.168.1.42");
		expect(ps.getCalls()).toEqual(["ipconfig getifaddr en0"]);
	});

	it("linux provider takes the first address hostname -I prints", async () => {
		ps.platform = "linux";
		ps.setCaptureOutput("10.0.0.5 10.0.0.6 \n", "");

		expect(await new LinuxIpProvider(ps).get()).toBe("10.0.0.5");
	});

	it("platform-specific providers reject the wrong platform", () => {
		expect(() => new LinuxIpProvider(ps)).toThrow("only supported on Linux");
		ps.platform = "freebsd";
		expect(() => new PlatformIpProvider(ps)).toThrow("Unsupported platform");
	});

	it("empty output is an error, not an empty address", async () => {
		ps.setCaptureOutput("  \n", "");

		expect(new DarwinIpProvider(ps).get()).rejects.toThrow(
			"no IP address found",
		);
	});

	it("non-zero exit is an error", async () => {
		ps.exit(1);
		ps.setCaptureOutput("192.168.1.42", "");

		expect(new DarwinIpProvider(ps).get()).rejects.toThrow("failed to get");
	});

	it("sequential provider skips throwing and empty providers, then gives up", async () => {
		const throwing = {
			get: () => Promise.reject(new Error("boom")),
		};

		expect(
			await new SequentialIpProvider([
				throwing,
				StaticIpProvider.empty(),
				new StaticIpProvider("1.2.3.4"),
				StaticIpProvider.localhost(),
			]).get(),
		).toBe("1.2.3.4");

		expect(await new SequentialIpProvider([throwing]).get()).toBe("");
		expect(await new SequentialIpProvider([]).get()).toBe("");
	});
});
