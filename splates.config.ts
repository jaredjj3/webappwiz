// Splates is a dev tool installed on the machine, not a dependency of this
// repository, so this file imports nothing from it.
export default {
	postCheckout: "bun install",
	postRewrite: "bun install",
	preMerge: "./bin/wiz dev test",
	ship: "./bin/wiz dev ship",
	afterBump: "bunx @webappwiz/cli update",
	wiz: "./bin/wiz",
};
