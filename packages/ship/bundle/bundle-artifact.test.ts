import { describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { Cut } from "../cut";
import type { Package } from "../workspace/workspace";
import { BundleArtifact } from "./bundle-artifact";
import { FakeBundle } from "./fake-bundle";

describe("bundle artifact", () => {
	const pkg = (name: string, isPrivate = false): Package => ({
		name,
		dir: `/repo/packages/${name}`,
		private: isPrivate,
		dependencies: [],
	});

	const cutting = (...packages: Package[]) =>
		new Cut("1.2.4", packages, { log: new MemoryLogger() });

	it("builds before anything publishes, and names no packages of its own", () => {
		const artifact = new BundleArtifact(new FakeBundle());

		expect(artifact.stage).toBe("build");
		// A release lists what it will send, and a build sends nothing.
		expect(artifact.packages).toEqual([]);
	});

	it("builds every package going out, in the order it was handed", async () => {
		const bundle = new FakeBundle();

		await new BundleArtifact(bundle).publish(
			cutting(pkg("two"), pkg("one"), pkg("three")),
		);

		expect(bundle.built).toEqual([
			"/repo/packages/two",
			"/repo/packages/one",
			"/repo/packages/three",
		]);
	});

	it("sends every package to where its build put it, not to its source", async () => {
		const cut = cutting(pkg("one"), pkg("hid", true));

		await new BundleArtifact(new FakeBundle()).publish(cut);

		expect(cut.dir("one")).toBe("/repo/packages/one/dist");
		// Nothing built the private one, so it still answers for itself.
		expect(cut.dir("hid")).toBe("/repo/packages/hid");
	});

	it("leaves a private package alone, since it never goes out", async () => {
		const bundle = new FakeBundle();

		await new BundleArtifact(bundle).publish(
			cutting(pkg("one"), pkg("hid", true)),
		);

		expect(bundle.built).toEqual(["/repo/packages/one"]);
	});

	it("stops at the package that would not build", async () => {
		const bundle = new FakeBundle();
		bundle.fails = "/repo/packages/two";

		await expect(
			new BundleArtifact(bundle).publish(
				cutting(pkg("one"), pkg("two"), pkg("three")),
			),
		).rejects.toThrow("build failed in /repo/packages/two");

		expect(bundle.built).toEqual(["/repo/packages/one"]);
	});

	it("clears the private packages too, which nothing else would", async () => {
		const bundle = new FakeBundle();

		await new BundleArtifact(bundle).clean(
			cutting(pkg("one"), pkg("hid", true)),
		);

		expect(bundle.cleaned).toEqual([
			"/repo/packages/one",
			"/repo/packages/hid",
		]);
	});
});
