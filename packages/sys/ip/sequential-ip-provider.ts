import type { IpProvider } from "./ip-provider";

export class SequentialIpProvider implements IpProvider {
	constructor(private readonly ipProviders: IpProvider[]) {}

	async get(): Promise<string> {
		for (const provider of this.ipProviders) {
			try {
				const ip = await provider.get();
				if (ip) {
					return ip;
				}
			} catch {
				// a failing provider just means try the next one
			}
		}
		return "";
	}
}
