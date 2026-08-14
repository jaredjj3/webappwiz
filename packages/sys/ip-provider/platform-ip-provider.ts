import { NodePs } from "../ps/node-ps";
import type { Ps } from "../ps/ps";
import { DarwinIpProvider } from "./darwin-ip-provider";
import type { IpProvider } from "./ip-provider";
import { LinuxIpProvider } from "./linux-ip-provider";
import { Win32IpProvider } from "./win32-ip-provider";

export class PlatformIpProvider implements IpProvider {
	private readonly provider: IpProvider;

	constructor(ps?: Ps) {
		const proc = ps ?? new NodePs();
		switch (proc.platform) {
			case "darwin":
				this.provider = new DarwinIpProvider(proc);
				break;
			case "linux":
				this.provider = new LinuxIpProvider(proc);
				break;
			case "win32":
				this.provider = new Win32IpProvider(proc);
				break;
			default:
				throw new Error(`Unsupported platform: ${proc.platform}`);
		}
	}

	get(): Promise<string> {
		return this.provider.get();
	}
}
