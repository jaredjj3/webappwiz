import type { ConfigFile } from "@webappwiz/arbor/config";

export default {
	postCheckout: "bun install",
	postRewrite: "bun install",
	preMerge: "./bin/wiz dev test",
} satisfies ConfigFile;
