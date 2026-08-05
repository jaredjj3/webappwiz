import type { Ps } from "../ps/ps";
import type { IpProvider } from "./ip-provider";

export class LinuxIpProvider implements IpProvider {
	constructor(private readonly ps: Ps) {
		if (ps.platform !== "linux") {
			throw new Error("LinuxIpProvider is only supported on Linux");
		}
	}

	async get(): Promise<string> {
		const result = await this.ps.spawnCapture(["hostname", "-I"]);
		if (result.exitCode !== 0) {
			throw new Error("failed to get IP address");
		}

		const ip = result.stdout.trim().split(/\s+/)[0];
		if (!ip) {
			throw new Error("no IP address found");
		}

		return ip;
	}
}
