import { SAMPLE_RATE } from "./pcm";

const PCM_FORMAT = 1;
const CHANNELS = 1;

/** PCM16 chunks at {@link SAMPLE_RATE} as a WAV file a browser can play. */
export function wav(chunks: Uint8Array<ArrayBuffer>[]): Blob {
	const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
	const header = new DataView(new ArrayBuffer(44));
	const ascii = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++) {
			header.setUint8(offset + i, text.charCodeAt(i));
		}
	};
	ascii(0, "RIFF");
	header.setUint32(4, 36 + size, true);
	ascii(8, "WAVE");
	ascii(12, "fmt ");
	header.setUint32(16, 16, true);
	header.setUint16(20, PCM_FORMAT, true);
	header.setUint16(22, CHANNELS, true);
	header.setUint32(24, SAMPLE_RATE, true);
	header.setUint32(28, SAMPLE_RATE * 2, true);
	header.setUint16(32, 2, true);
	header.setUint16(34, 16, true);
	ascii(36, "data");
	header.setUint32(40, size, true);
	return new Blob([header.buffer, ...chunks], { type: "audio/wav" });
}
