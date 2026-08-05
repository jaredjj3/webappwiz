import { expect, test } from "bun:test";

import {
	DarwinIpProvider,
	FakePs,
	LinuxIpProvider,
	PlatformIpProvider,
	SequentialIpProvider,
	StaticIpProvider,
} from "../index";

test("darwin provider reads the trimmed address from ipconfig", async () => {
	const ps = new FakePs();
	ps.setCaptureOutput("192.168.1.42\n", "");

	expect(await new DarwinIpProvider(ps).get()).toBe("192.168.1.42");
	expect(ps.getCalls()).toEqual(["ipconfig getifaddr en0"]);
});

test("linux provider takes the first address hostname -I prints", async () => {
	const ps = new FakePs();
	ps.platform = "linux";
	ps.setCaptureOutput("10.0.0.5 10.0.0.6 \n", "");

	expect(await new LinuxIpProvider(ps).get()).toBe("10.0.0.5");
});

test("platform-specific providers reject the wrong platform", () => {
	const ps = new FakePs();

	expect(() => new LinuxIpProvider(ps)).toThrow("only supported on Linux");
	ps.platform = "freebsd";
	expect(() => new PlatformIpProvider(ps)).toThrow("Unsupported platform");
});

test("empty output is an error, not an empty address", async () => {
	const ps = new FakePs();
	ps.setCaptureOutput("  \n", "");

	expect(new DarwinIpProvider(ps).get()).rejects.toThrow("no IP address found");
});

test("non-zero exit is an error", async () => {
	const ps = new FakePs();
	ps.exit(1);
	ps.setCaptureOutput("192.168.1.42", "");

	expect(new DarwinIpProvider(ps).get()).rejects.toThrow("failed to get");
});

test("sequential provider skips throwing and empty providers, then gives up", async () => {
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
