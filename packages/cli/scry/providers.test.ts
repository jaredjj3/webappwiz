import { describe, expect, it } from "bun:test";
import { Claude, Clef, Jev } from "@webappwiz/scry";
import { Credentials, Environment } from "webappwiz/creds";
import { FakeSecretStore } from "webappwiz/creds/testing";
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
			new Credentials([new Environment({ ps }), new FakeSecretStore(kept)]),
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

	it("makes Claude for any of Anthropic's claude names, with ANTHROPIC_API_KEY", async () => {
		const judge = await providers({ ANTHROPIC_API_KEY: "sk-key" }).judge(
			"claude-sonnet-5-5",
		);

		expect(judge).toBeInstanceOf(Claude);
		expect((judge as Claude).model).toEqual("claude-sonnet-5-5");
		await expect(providers({}).judge("claude-opus-5-5")).rejects.toThrow(
			"claude-opus-5-5 needs ANTHROPIC_API_KEY",
		);
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
			"no model \"gpt-6-luna\": scry knows clef, clef-flash, Jev by TypeSafe's names, like jev-latest, and Claude by Anthropic's, like claude-sonnet-5-5",
		);
	});
});
