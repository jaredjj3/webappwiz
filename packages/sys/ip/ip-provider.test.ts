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

	it("reads the trimmed address from ipconfig on darwin", async () => {
		ps.setCaptureOutput("192.168.1.42\n", "");

		expect(await new DarwinIpProvider(ps).get()).toBe("192.168.1.42");
		expect(ps.getCalls()).toEqual(["ipconfig getifaddr en0"]);
	});

	it("takes the first address hostname -I prints on linux", async () => {
		ps.platform = "linux";
		ps.setCaptureOutput("10.0.0.5 10.0.0.6 \n", "");

		expect(await new LinuxIpProvider(ps).get()).toBe("10.0.0.5");
	});

	it("throws when constructed on the wrong platform", () => {
		expect(() => new LinuxIpProvider(ps)).toThrow("only supported on Linux");
		ps.platform = "freebsd";
		expect(() => new PlatformIpProvider(ps)).toThrow("Unsupported platform");
	});

	it("rejects instead of returning an empty address when the output is blank", async () => {
		ps.setCaptureOutput("  \n", "");

		expect(new DarwinIpProvider(ps).get()).rejects.toThrow(
			"no IP address found",
		);
	});

	it("rejects when the command exits non-zero", async () => {
		ps.exit(1);
		ps.setCaptureOutput("192.168.1.42", "");

		expect(new DarwinIpProvider(ps).get()).rejects.toThrow("failed to get");
	});

	it("skips throwing and empty providers, then returns empty when none answer", async () => {
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
