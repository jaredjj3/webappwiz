import { BrowserRecording } from "./browser-recording";
import type { AudioSink, Microphone, Recording } from "./microphone";
import { Pcm16Encoder } from "./pcm16-encoder";

/** Hands each block of the mic's samples to the page, as it comes. */
const TAP = `registerProcessor("tap", class extends AudioWorkletProcessor {
	process([input]) {
		if (input[0] !== undefined) this.port.postMessage(input[0].slice());
		return true;
	}
});`;

/** The mic through `getUserMedia`, tapped by an `AudioWorklet` for its samples. */
export class BrowserMicrophone implements Microphone {
	async start(sink: AudioSink): Promise<Recording> {
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				channelCount: 1,
				echoCancellation: true,
				noiseSuppression: true,
			},
		});
		const context = new AudioContext();
		try {
			// A worklet loads from a URL; one made here needs no route or build.
			const url = URL.createObjectURL(
				new Blob([TAP], { type: "text/javascript" }),
			);
			await context.audioWorklet.addModule(url);
			URL.revokeObjectURL(url);
			// No outputs makes it a sink, which the browser runs without a
			// speaker to play into.
			const tap = new AudioWorkletNode(context, "tap", { numberOfOutputs: 0 });
			const source = context.createMediaStreamSource(stream);
			source.connect(tap);
			await context.resume();
			return new BrowserRecording(
				stream,
				context,
				tap,
				new Pcm16Encoder(context.sampleRate, sink),
			);
		} catch (error) {
			void context.close();
			for (const track of stream.getTracks()) {
				track.stop();
			}
			throw error;
		}
	}
}
