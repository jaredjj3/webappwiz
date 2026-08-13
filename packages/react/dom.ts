// Test-only: hooks need a DOM to render into. Imported for its side effect by
// every test in this package, rather than preloaded, because `wiz test` runs
// one `bun test` from the workspace root and a per-package bunfig is not read
// from there. Registering happens on first import and the module cache makes
// it once per worker.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// `register()` replaces globals for the whole process, and happy-dom's HTTP
// classes are not the ones the runtime serves with: `Bun.serve` does not
// recognise a happy-dom `Response` and quietly answers with its own welcome
// page instead. Under a non-parallel `bun test` that would corrupt every file
// loaded after this one. Nothing that needs a DOM needs happy-dom's HTTP, so
// hand the runtime's back. `dom.test.ts` fails if this stops working.
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
