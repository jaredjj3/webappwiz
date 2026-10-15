import { describe, expect, it } from "bun:test";
import { Pcm16Encoder } from "./pcm16-encoder";

/** Everything `push`ing `blocks` at `rate` emits, flushed, as samples. */
function encode(rate: number, ...blocks: number[][]): number[][] {
	const chunks: number[][] = [];
	const encoder = new Pcm16Encoder(rate, {
		send: (pcm) => chunks.push([...new Int16Array(pcm.slice().buffer)]),
	});
	for (const block of blocks) {
		encoder.push(new Float32Array(block));
	}
	encoder.flush();
	return chunks;
}

describe("Pcm16Encoder", () => {
	it("keeps every sample at 24 kHz, scaled to 16 bits", () => {
		expect(encode(24000, [0, 0.5, -0.5, 1, -1, 2])).toEqual([
			[0, 16384, -16384, 32767, -32768],
		]);
	});

	it("keeps every other sample at 48 kHz, across blocks", () => {
		expect(encode(48000, [0, 0.1, 0.2], [0.3, 0.4, 0.5, 0.6])).toEqual([
			[0, 6553, 13107],
		]);
	});

	it("sends a tenth of a second at a time", () => {
		const chunks = encode(24000, new Array(5000).fill(0));
		expect(chunks.map((chunk) => chunk.length)).toEqual([2400, 2400, 199]);
	});
});
