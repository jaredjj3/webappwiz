import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs, FakePs } from "webappwiz/system/testing";
import { Duration } from "webappwiz/time";
import { FakeTimer } from "webappwiz/time/testing";
import { FakeBundle } from "./bundle/fake-bundle";
import { FakeGit } from "./git/fake-git";
import { FakeGithub } from "./github/fake-github";
import { GithubArtifact } from "./github/github-artifact";
import { FakeRegistry } from "./registry/fake-registry";
import type { Release, ReleaseOptions } from "./release";
import { releases } from "./releases";
import type { ReleaseStepEvent } from "./step-events";
import { FakeWorkspace } from "./workspace/fake-workspace";

describe("release", () => {
	let workspace: FakeWorkspace;
	let git: FakeGit;
	let registry: FakeRegistry;
	let github: FakeGithub;
	let log: MemoryLogger;
	let fs: FakeFs;
	let ps: FakePs;
	let asked: string[];
	/** Both public packages onto one registry, tagged, with the notes last. */
	let release: Release;

	beforeEach(async () => {
		workspace = new FakeWorkspace();
		git = new FakeGit();
		registry = new FakeRegistry();
		github = new FakeGithub();
		log = new MemoryLogger();
		fs = new FakeFs();
		ps = new FakePs();
		await fs.mkdir("/repo");
		asked = [];
		release = releases.lockstep(
			releases.custom("@scope/one", registry),
			releases.custom("@scope/two", registry),
			releases.git({ git }),
			new GithubArtifact(github),
		);
	});

	const answering = (answer: string | null): ReleaseOptions => ({
		workspace,
		git,
		log,
		fs,
		ps,
		prompt: (message) => {
			asked.push(message);
			return answer;
		},
	});

	/** Everything the release said, colour codes and all. */
	const said = () =>
		log.entries.map((entry) => String(entry.message)).join("\n");

	const events = async (): Promise<ReleaseStepEvent[]> =>
		(await fs.read("/repo/events.jsonl"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as ReleaseStepEvent);

	it("stamps, commits, publishes, tags, pushes and writes the notes", async () => {
		await release.release(answering(" Y "));

		expect(workspace.stamped).toEqual(["1.2.4"]);
		expect(git.commits).toEqual(["Release 1.2.4"]);
		expect(registry.publishes).toEqual([
			"/repo/packages/one",
			"/repo/packages/two",
		]);
		expect([...git.tags]).toEqual(["v1.2.4"]);
		expect(git.pushes).toEqual(["main", "v1.2.4"]);
		expect(github.releases).toEqual(["v1.2.4"]);
		expect(await fs.exists("/repo/RELEASE")).toBe(false);
	});

	it("stops before caller steps or stamping when the initial push fails", async () => {
		git.rejects.add("main");
		let ran = false;
		const declared = releases.lockstep(
			releases.push({ git }),
			release,
			releases.step({
				name: "Gate",
				stage: "preflight",
				deadline: Duration.mins(1),
				run: async () => {
					ran = true;
				},
			}),
		);

		await expect(declared.release(answering("y"))).rejects.toThrow("rejected");

		expect(ran).toBe(false);
		expect(workspace.stamped).toEqual([]);
		expect(registry.publishes).toEqual([]);
		expect(await fs.exists("/repo/RELEASE")).toBe(false);
	});

	it("writes every declared step and its transitions as JSON lines", async () => {
		ps.setEnv({ WEBAPPWIZ_SHIP_EVENTS: "/repo/events.jsonl" });

		await release.release(answering("y"));

		const written = await events();
		expect(written[0]).toMatchObject({
			type: "declared",
			id: "preflight",
			name: "Preflight",
			deadlineMs: 30_000,
		});
		expect(
			written
				.filter((event) => event.type === "declared")
				.map((event) => event.name),
		).toEqual([
			"Preflight",
			"Version 1.2.4",
			"Publish @scope/one@1.2.4",
			"Available @scope/one@1.2.4",
			"Publish @scope/two@1.2.4",
			"Available @scope/two@1.2.4",
			"Push branch",
			"Tag v1.2.4",
			"Push v1.2.4",
			"Release notes",
		]);
		expect(
			written
				.filter((event) => event.type === "check")
				.map((event) => event.passed),
		).toEqual([true, true]);
		expect(written.at(-1)).toMatchObject({
			type: "done",
			name: "Release notes",
		});
		expect(written.every((event) => !("expectedMs" in event))).toBe(true);
		expect(written.every((event) => !Number.isNaN(Date.parse(event.at)))).toBe(
			true,
		);
	});

	it("writes no event file when WEBAPPWIZ_SHIP_EVENTS is unset", async () => {
		await release.release(answering("y"));

		expect(await fs.exists("/repo/events.jsonl")).toBe(false);
	});

	it("reports a failed step before rethrowing", async () => {
		ps.setEnv({ WEBAPPWIZ_SHIP_EVENTS: "/repo/events.jsonl" });
		github.error = new Error("not logged in to GitHub");

		await expect(release.release(answering("y"))).rejects.toThrow(
			"not logged in to GitHub",
		);

		expect((await events()).at(-1)).toMatchObject({
			type: "failed",
			name: "Release notes",
			error: "not logged in to GitHub",
		});
	});

	it("runs caller steps and retries their checks past the deadline", async () => {
		ps.setEnv({ WEBAPPWIZ_SHIP_EVENTS: "/repo/events.jsonl" });
		const timer = new FakeTimer();
		let runs = 0;
		let checks = 0;
		const withStep = releases.lockstep(
			release,
			releases.step({
				name: "Audit",
				deadline: Duration.zero(),
				stage: "preflight",
				run: async () => {
					runs++;
				},
				check: async () => ++checks === 2,
			}),
		);

		const running = withStep.release({ ...answering("y"), timer });
		await Bun.sleep(0);
		expect(timer.timeouts).toHaveLength(1);
		timer.fireTimeouts();
		await running;

		expect(runs).toBe(1);
		expect(checks).toBe(2);
		expect(
			(await events())
				.filter((event) => event.type === "check")
				.map((event) => event.passed),
		).toEqual([false, true, true, true]);
	});

	it("reports steps already done on resume without starting them again", async () => {
		ps.setEnv({ WEBAPPWIZ_SHIP_EVENTS: "/repo/events.jsonl" });
		github.error = new Error("stop after the tag");
		await expect(release.release(answering("y"))).rejects.toThrow(
			"stop after the tag",
		);
		await fs.write("/repo/events.jsonl", "");
		github.error = undefined;

		await release.release(answering("y"));

		const publish = (await events()).filter(
			(event) =>
				event.name === "Publish @scope/one@1.2.4" && event.type !== "declared",
		);
		expect(publish.map((event) => event.type)).toEqual(["done"]);
	});

	it("goes ahead without asking when told yes", async () => {
		await release.release({ ...answering(null), yes: true });

		expect(asked).toEqual([]);
		expect(workspace.stamped).toEqual(["1.2.4"]);
	});

	it("moves the version as far as the bump says", async () => {
		await release.release({ ...answering("y"), bump: "minor" });

		expect(workspace.stamped).toEqual(["1.3.0"]);
	});

	it("takes the whole major version", async () => {
		await release.release({ ...answering("y"), bump: "major" });

		expect(workspace.stamped).toEqual(["2.0.0"]);
	});

	it("publishes before it tags, however the declaration is ordered", async () => {
		const order: string[] = [];
		registry.publish = async (dir: string) => {
			order.push(`publish ${dir}`);
		};
		git.tag = async (tag: string) => {
			order.push(`tag ${tag}`);
			git.tags.add(tag);
		};
		github.release = async (tag: string) => {
			order.push(`notes ${tag}`);
		};
		const scrambled = releases.lockstep(
			new GithubArtifact(github),
			releases.git({ git }),
			releases.custom("@scope/one", registry),
			releases.custom("@scope/two", registry),
		);

		await scrambled.release(answering("y"));

		expect(order).toEqual([
			"publish /repo/packages/one",
			"publish /repo/packages/two",
			"tag v1.2.4",
			"notes v1.2.4",
		]);
	});

	it("skips a package the registry already has", async () => {
		registry.has.add("@scope/one@1.2.4");

		await release.release(answering("y"));

		expect(registry.publishes).toEqual(["/repo/packages/two"]);
	});

	it("does not push existing commits without an explicit push release", async () => {
		await release.release(answering("n"));

		expect(git.pushes).toEqual([]);
	});

	it("pushes existing commits before asking, and stops publishing on any other answer", async () => {
		git.current = "master";
		git.trunk = "master";
		await releases
			.lockstep(releases.push({ git }), release)
			.release(answering("n"));

		expect(git.pushes).toEqual(["master"]);
		expect(asked.join()).toContain("publish 2 packages as 1.2.4?");
		expect(workspace.stamped).toEqual([]);
		expect(registry.publishes).toEqual([]);
		expect(git.commits).toEqual([]);
		expect(await fs.exists("/repo/RELEASE")).toBe(false);
	});

	it("leaves RELEASE behind when an artifact fails, and finishes from it", async () => {
		github.error = new Error("not logged in to GitHub");

		await expect(release.release(answering("y"))).rejects.toThrow(
			"not logged in to GitHub",
		);

		const state = JSON.parse(await fs.read("/repo/RELEASE"));
		expect(state.version).toBe("1.2.4");
		// Both publishes and availability checks, then branch push, tag and tag push.
		expect(state.done).toHaveLength(7);

		// The retry finishes 1.2.4 whatever bump it asked for, skipping every
		// step RELEASE says landed without so much as a registry lookup.
		github.error = undefined;
		const looked: string[] = [];
		registry.published = async (name: string) => {
			looked.push(name);
			return false;
		};
		await release.release({ ...answering("y"), bump: "major" });

		expect(said()).toContain("finishing the release of 1.2.4");
		expect(workspace.stamped).toEqual(["1.2.4", "1.2.4"]);
		expect(looked).toEqual([]);
		expect(registry.publishes).toEqual([
			"/repo/packages/one",
			"/repo/packages/two",
		]);
		expect(github.releases).toEqual(["v1.2.4"]);
		expect(await fs.exists("/repo/RELEASE")).toBe(false);
		expect(said()).toContain("shipped 1.2.4");
	});

	it("stamps a skill into the release commit, and again when resuming", async () => {
		await fs.write("/repo/arbor.skill.md", "---\nversion: 0.0.0\n---\n");
		const withSkill = releases.lockstep(
			release,
			releases.skill("arbor.skill.md", { fs }),
		);
		// What the commit would take with it, read at the moment it is made.
		let committed = "";
		git.commitAll = async (message: string) => {
			git.commits.push(message);
			committed = await fs.read("/repo/arbor.skill.md");
		};
		github.error = new Error("not logged in to GitHub");

		await expect(withSkill.release(answering("y"))).rejects.toThrow(
			"not logged in to GitHub",
		);

		expect(committed).toContain("version: 1.2.4");
		// The stamp is never marked done, so the resumed run writes it again
		// rather than trusting a file it cannot see.
		expect(JSON.parse(await fs.read("/repo/RELEASE")).done).not.toContain(
			"stamp",
		);
		await fs.write("/repo/arbor.skill.md", "---\nversion: 0.0.0\n---\n");
		github.error = undefined;
		await withSkill.release(answering("y"));

		expect(await fs.read("/repo/arbor.skill.md")).toContain("version: 1.2.4");
	});

	it("refuses a RELEASE file it cannot read", async () => {
		await fs.write("/repo/RELEASE", "half a releas");

		await expect(release.release(answering("y"))).rejects.toThrow(
			"does not hold release state",
		);
		expect(workspace.stamped).toEqual([]);
	});

	it("refuses a dirty tree, whose changes the release commit would take", async () => {
		git.dirty = true;

		await expect(release.release(answering("y"))).rejects.toThrow(
			"uncommitted changes: releases go out from a clean tree",
		);
		expect(asked).toEqual([]);
		expect(workspace.stamped).toEqual([]);
		expect(git.commits).toEqual([]);
	});

	it("refuses to release from anywhere but the default branch", async () => {
		git.current = "task/ship";

		await expect(release.release(answering("y"))).rejects.toThrow(
			'on "task/ship": releases go out from "main"',
		);
		expect(workspace.stamped).toEqual([]);
		expect(registry.publishes).toEqual([]);
	});

	it("refuses a package the workspace has nothing public by the name of", async () => {
		const roaming = releases.lockstep(
			releases.custom("@scope/one", registry),
			releases.custom("@scope/two", registry),
			releases.custom("@scope/gone", registry),
			releases.git({ git }),
		);

		await expect(roaming.release(answering("y"))).rejects.toThrow(
			'"@scope/gone" is declared but the workspace has no public package by that name',
		);
	});

	it("refuses a public package nobody declared", async () => {
		const partial = releases.lockstep(
			releases.custom("@scope/one", registry),
			releases.git({ git }),
		);

		await expect(partial.release(answering("y"))).rejects.toThrow(
			'"@scope/two" is public but not declared: declare it or mark it private',
		);
	});

	it("says every way the declaration drifted at once", async () => {
		const drifted = releases.lockstep(
			releases.custom("@scope/one", registry),
			releases.custom("@scope/gone", registry),
			releases.git({ git }),
		);

		await expect(drifted.release(answering("y"))).rejects.toThrow(
			/"@scope\/gone" is declared[\s\S]*"@scope\/two" is public/,
		);
	});

	it("refuses a declaration with nothing to publish", async () => {
		await expect(releases.git({ git }).release(answering("y"))).rejects.toThrow(
			"there is nothing to publish",
		);
	});

	it("publishes a package only once the siblings it needs are out", async () => {
		// Alphabetically `one` leads, but it needs `two`, so `two` goes first. A
		// release that died in between would leave `two` installable rather than
		// leaving `one` naming a version no registry has.
		workspace = new FakeWorkspace([
			{
				name: "@scope/one",
				dir: "/repo/packages/one",
				private: false,
				dependencies: ["@scope/two"],
			},
			{
				name: "@scope/two",
				dir: "/repo/packages/two",
				private: false,
				dependencies: [],
			},
		]);

		await releases
			.lockstep(
				releases.custom("@scope/one", registry),
				releases.custom("@scope/two", registry),
			)
			.release(answering("y"));

		expect(registry.publishes).toEqual([
			"/repo/packages/two",
			"/repo/packages/one",
		]);
	});

	it("clears what the build left, and publishes nothing it could not build", async () => {
		const bundle = new FakeBundle();
		bundle.fails = "/repo/packages/one";
		const building = releases.lockstep(
			releases.build(bundle),
			releases.custom("@scope/one", registry),
			releases.custom("@scope/two", registry),
			releases.git({ git }),
		);

		await expect(building.release(answering("y"))).rejects.toThrow(
			"build failed in /repo/packages/one",
		);

		expect(registry.publishes).toEqual([]);
		expect(git.tags.size).toBe(0);
		// The private package is cleared alongside the rest: it was stamped too.
		expect(bundle.cleaned).toEqual([
			"/repo/packages/hid",
			"/repo/packages/one",
			"/repo/packages/two",
		]);
	});

	it("rebuilds on retry while leaving completed publishes alone", async () => {
		const bundle = new FakeBundle();
		const building = releases.lockstep(
			releases.build(bundle),
			releases.custom("@scope/one", registry),
			releases.custom("@scope/two", registry),
		);
		registry.fails = "/repo/packages/two/dist";
		await expect(building.release(answering("y"))).rejects.toThrow(
			"publish failed",
		);
		registry.fails = undefined;
		// Even a failed rebuild must stop the retry before anything publishes.
		bundle.fails = "/repo/packages/two";
		await expect(building.release(answering("y"))).rejects.toThrow(
			"build failed",
		);
		expect(registry.publishes).toEqual(["/repo/packages/one/dist"]);
		bundle.fails = undefined;
		await building.release(answering("y"));
		expect(registry.publishes).toEqual([
			"/repo/packages/one/dist",
			"/repo/packages/two/dist",
		]);
		expect(bundle.built.filter((dir) => dir.endsWith("/two"))).toHaveLength(2);
	});

	it("clears the build after a release that worked", async () => {
		const bundle = new FakeBundle();

		await releases
			.lockstep(
				releases.build(bundle),
				releases.custom("@scope/one", registry),
				releases.custom("@scope/two", registry),
				releases.git({ git }),
			)
			.release(answering("y"));

		expect(bundle.built).toEqual(["/repo/packages/one", "/repo/packages/two"]);
		expect(bundle.cleaned).toHaveLength(3);
		// What the registry took is the build, not the directory it was built from:
		// the source stays in the repository it was written in.
		expect(registry.publishes).toEqual([
			"/repo/packages/one/dist",
			"/repo/packages/two/dist",
		]);
	});

	describe("status", () => {
		it("reads what each artifact has live beside the workspace version", async () => {
			registry.latest.set("@scope/one", "1.2.3");
			git.remote.add("v1.2.3");
			github.releases.push("v1.2.2");

			const status = await releases
				.lockstep(release, releases.build(new FakeBundle()))
				.status({ workspace });

			// The build has nowhere to ask, so it is left out.
			expect(status).toEqual({
				version: await workspace.version(),
				artifacts: [
					{ name: "@scope/one", packages: ["@scope/one"], deployed: "1.2.3" },
					{ name: "@scope/two", packages: ["@scope/two"], deployed: undefined },
					{ name: "git tag", packages: [], deployed: "1.2.3" },
					{ name: "GitHub release", packages: [], deployed: "1.2.2" },
				],
			});
		});

		it("names an artifact that names itself nothing by what it publishes", async () => {
			const status = await releases
				.lockstep({
					packages: ["@scope/one"],
					publish: async () => {},
					deployed: async () => "1.2.3",
				})
				.status({ workspace });

			expect(status.artifacts).toEqual([
				{ name: "@scope/one", packages: ["@scope/one"], deployed: "1.2.3" },
			]);
		});
	});
});
