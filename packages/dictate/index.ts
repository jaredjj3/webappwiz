import { readSystems } from "@webappwiz/arbor/systems";
import { Credentials, SystemSecretStore } from "webappwiz/creds";
import { UuidProvider } from "webappwiz/id";
import { DictateServer } from "./dictate-server";
import { DictateService } from "./dictate-service";
import { OpenAiTranscriber } from "./openai-transcriber";
import { Takes } from "./takes";
import { vocabulary, words } from "./vocabulary";

// The store only, as a dev run should read it: a stray export is never what
// the playground picks up. `arbor creds request OPENAI_API_KEY --device` puts
// it there.
const credentials = new Credentials([
	await SystemSecretStore.forProject(),
	SystemSecretStore.device(),
]);
const apiKey = await credentials.require("OPENAI_API_KEY");

const root = `${import.meta.dirname}/../..`;
const systems = await readSystems(root);
const transcriber = new OpenAiTranscriber(apiKey, {
	prompt: vocabulary(systems),
	keywords: words(systems),
});
const server = new DictateServer(
	new DictateService(transcriber, new Takes(new UuidProvider())),
	process.env.PORT === undefined ? {} : { port: Number(process.env.PORT) },
);
console.log(`dictate on ${server.url}`);
