import { describe, expect, it } from "bun:test";
import { wav } from "./wav";

describe("wav", () => {
	it("heads the samples with a 24 kHz mono 16-bit header", async () => {
		const file = wav([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
		expect(file.type).toBe("audio/wav");
		const view = new DataView(await file.arrayBuffer());
		expect(view.byteLength).toBe(48);
		expect(view.getUint32(4, true)).toBe(40);
		expect(view.getUint16(22, true)).toBe(1);
		expect(view.getUint32(24, true)).toBe(24000);
		expect(view.getUint16(34, true)).toBe(16);
		expect(view.getUint32(40, true)).toBe(4);
		expect([...new Uint8Array(await file.arrayBuffer()).slice(44)]).toEqual([
			1, 2, 3, 4,
		]);
	});
});
