import { describe, expect, it } from "bun:test";
import { Clef, Jev } from "@webappwiz/scry";
import { Credentials } from "webappwiz/credentials";
import { FakeSecretStore } from "webappwiz/credentials/testing";
import { FakePs } from "webappwiz/system/testing";
import { HostedProviders } from "./providers";

describe("HostedProviders", () => {
	const providers = (
		env: Record<string, string>,
		kept: Record<string, string> = {},
	) => {
		const ps = new FakePs();
		ps.setEnv(env);
		return new HostedProviders(
			new Credentials(new FakeSecretStore(kept), { ps }),
		);
	};

	it("makes Clef on Workers AI for clef and clef-flash, from the store", async () => {
		const judge = await providers(
			{},
			{ CLOUDFLARE_ACCOUNT_ID: "acct", CLOUDFLARE_API_TOKEN: "token" },
		).judge("clef-flash");

		expect(judge).toBeInstanceOf(Clef);
		expect((judge as Clef).model).toEqual("clef-flash");
	});

	it("makes Jev for any of TypeSafe's jev names, from the environment", async () => {
		const judge = await providers({ TYPESAFE_API_KEY: "key" }).judge(
			"jev-1.13.0",
		);

		expect(judge).toBeInstanceOf(Jev);
		expect((judge as Jev).model).toEqual("jev-1.13.0");
	});

	it("names every credential a model is missing, and how a person adds it", async () => {
		await expect(
			providers({ CLOUDFLARE_ACCOUNT_ID: "acct" }).judge("clef"),
		).rejects.toThrow(
			"clef needs CLOUDFLARE_API_TOKEN: ask a person to run `bunx @webappwiz/cli creds add CLOUDFLARE_API_TOKEN`, or set it in the environment",
		);
	});

	it("refuses a model it does not know, and says which it does", async () => {
		await expect(providers({}).judge("gpt-6-luna")).rejects.toThrow(
			'no model "gpt-6-luna": scry knows clef, clef-flash, and Jev by TypeSafe\'s names, like jev-latest',
		);
	});
});
