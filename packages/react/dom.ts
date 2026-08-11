// Test-only: hooks need a DOM to render into. Imported for its side effect by
// every test in this package, rather than preloaded, because `wiz test` runs
// one `bun test` from the workspace root and a per-package bunfig is not read
// from there. Registering happens on first import and the module cache makes
// it once per worker.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
