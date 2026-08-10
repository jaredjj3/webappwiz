import type { Fs, Ps } from "@webappwiz/sys";

const root = `${import.meta.dir}/../..`;

export async function test(
	opts: { package: string },
	fs: Fs,
	ps: Ps,
): Promise<void> {
	// one run from the root, so bun reports every failure together instead of
	// scrolling the early packages' errors off the top
	const filter: string[] = [];
	if (opts.package !== "") {
		if (!(await fs.exists(`${root}/packages/${opts.package}`))) {
			throw new Error(`no such package: ${opts.package}`);
		}
		filter.push(`packages/${opts.package}/`);
	}

	// serial: the suites share fixtures built in beforeEach, which --concurrent races
	const { exitCode } = await ps.spawn(
		["bun", "test", "--pass-with-no-tests", ...filter],
		{ cwd: root },
	);
	if (exitCode !== 0) {
		throw new Error("Tests failed");
	}
}
