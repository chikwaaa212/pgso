// Loaded via `node --test --import ...` (see package.json `test` script).
// Registers the resolver that stubs `server-only` for unit tests.
import { register } from "node:module";

register("./server-only-hooks.mjs", import.meta.url);
