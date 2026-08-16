// Test-only: the packages whose tests need a DOM import this for its side
// effect. It lives at the workspace root rather than inside a package because
// every package here is published, and a published entry point that imports a
// test tool is broken for anyone who installs it.
//
// Imported per file rather than preloaded through bunfig. `wiz test` runs
// `bun test --parallel`, a worker per file, so importing it here registers
// happy-dom only in the workers that asked for a DOM. A preload would register
// it in every worker, and happy-dom replaces 33 globals: not just the HTTP
// classes below but `setTimeout`, `URL`, `AbortSignal` and the stream types,
// which the server-side packages are tested against.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Even within one worker, `register()` replaces globals for the whole process,
// and happy-dom's HTTP classes are not the ones the runtime serves with:
// `Bun.serve` does not recognise a happy-dom `Response` and quietly answers
// with its own welcome page instead. That would corrupt any file loaded after
// this one in the same worker. Nothing that needs a DOM needs happy-dom's
// HTTP, so hand the runtime's back.
const http = ["Response", "Request", "Headers", "fetch"];
const runtime = http.map(
	(name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
);

GlobalRegistrator.register();

for (const [name, descriptor] of runtime) {
	if (descriptor !== undefined) {
		Object.defineProperty(globalThis, name, descriptor);
	}
}
