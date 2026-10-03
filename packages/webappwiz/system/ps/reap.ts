/**
 * Collects a child's exit status from the kernel, for the runtime that loses
 * it. Bun on macOS learns that a child exited from a one-shot kqueue event,
 * and under load it drops some: the child stays a zombie and `close` never
 * comes (oven-sh/bun#34069). `waitpid` with `WNOHANG` reaps a child that has
 * exited and returns at once for one that has not.
 *
 * Returns the raw wait status, or null while the child runs or once someone
 * else has reaped it. The whole thing is null where exits are not lost: Node,
 * and Bun anywhere but macOS.
 */
export const reap: ((pid: number) => number | null) | null =
	process.versions.bun && process.platform === "darwin" ? await load() : null;

const WNOHANG = 1;

async function load(): Promise<(pid: number) => number | null> {
	const { dlopen, FFIType, ptr } = await import("bun:ffi");
	const { symbols } = dlopen("libc.dylib", {
		waitpid: {
			args: [FFIType.i32, FFIType.ptr, FFIType.i32],
			returns: FFIType.i32,
		},
	});
	const status = new Int32Array(1);
	return (pid) =>
		symbols.waitpid(pid, ptr(status), WNOHANG) === pid
			? (status[0] ?? 0)
			: null;
}

/** A wait status as a shell reports it: the exit code, or 128 + the signal. */
export function decode(status: number): number {
	const signal = status & 0x7f;
	return signal === 0 ? (status >> 8) & 0xff : 128 + signal;
}
