import { defineConfig } from "@webappwiz/arbor/config";

export default defineConfig({
	postCheckout: "bun install",
	postRewrite: "bun install",
	preMerge: "./bin/wiz dev test",
	postMerge: "bun install",
});
