import { describe, expect, it } from "bun:test";

import { FakePs } from "../testing";
import { PlatformIpProvider } from "./platform-ip-provider";

describe("PlatformIpProvider", () => {
	it("throws when the platform has no provider", () => {
		const ps = new FakePs();
		ps.platform = "freebsd";

		expect(() => new PlatformIpProvider({ ps: ps })).toThrow(
			"Unsupported platform",
		);
	});
});
