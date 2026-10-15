import type { Resource } from "webappwiz/disposable";
import { Dispatcher, type Eventful } from "webappwiz/events";
import type { TakeSummary } from "../take";
import type { DictateApi } from "./dictate-api";
import type { LiveSocket } from "./live-socket";
import type { Microphone, Recording } from "./microphone";

/** Where the mic is in a take: waiting, asking for it, listening, or finishing the text. */
export type Phase = "idle" | "starting" | "recording" | "transcribing";

/** What the page shows. */
export interface DictationState {
	phase: Phase;
	/** Why the last start or take failed, until the next one. */
	error: string | undefined;
	/** The take under way as heard so far, rough until it is kept. */
	live: string;
	/** Newest first. */
	takes: TakeSummary[];
}

/**
 * Records a take, streaming it to the server to be transcribed as it is
 * spoken, and keeps the list of takes.
 */
export class DictationController
	implements Eventful<{ changed: undefined }>, Resource
{
	private readonly dispatcher = new Dispatcher<{ changed: undefined }>();
	readonly events = this.dispatcher.events;
	private current: DictationState = {
		phase: "idle",
		error: undefined,
		live: "",
		takes: [],
	};
	private socket: LiveSocket | undefined;
	private recording: Recording | undefined;

	constructor(
		private readonly microphone: Microphone,
		private readonly api: DictateApi,
	) {}

	get state(): DictationState {
		return this.current;
	}

	/** Lists the takes the server already has. */
	async load(): Promise<void> {
		try {
			this.set({ takes: await this.api.list() });
		} catch (error) {
			this.set({ error: message(error) });
		}
	}

	/** Starts a take when idle, ends and keeps it while recording. */
	async toggle(): Promise<void> {
		if (this.current.phase === "idle") {
			await this.start();
		} else if (this.current.phase === "recording") {
			await this.stop();
		}
	}

	dispose(): void {
		this.recording?.dispose();
		this.recording = undefined;
		this.socket?.dispose();
		this.socket = undefined;
		this.dispatcher.dispose();
	}

	private async start(): Promise<void> {
		this.set({ phase: "starting", error: undefined, live: "" });
		try {
			const socket = await this.api.listen();
			this.socket = socket;
			socket.events.on("heard", (live) => this.set({ live }));
			socket.events.on("failed", (error) => this.set({ error }));
			this.recording = await this.microphone.start(socket);
			this.set({ phase: "recording" });
		} catch (error) {
			this.socket?.dispose();
			this.socket = undefined;
			this.set({ phase: "idle", error: message(error) });
		}
	}

	private async stop(): Promise<void> {
		const { recording, socket } = this;
		this.recording = undefined;
		this.socket = undefined;
		if (recording === undefined || socket === undefined) {
			return;
		}
		recording.dispose();
		this.set({ phase: "transcribing" });
		try {
			const take = await socket.finish();
			this.set({
				phase: "idle",
				live: "",
				takes: [take, ...this.current.takes],
			});
		} catch (error) {
			this.set({ phase: "idle", error: message(error) });
		} finally {
			socket.dispose();
		}
	}

	private set(change: Partial<DictationState>): void {
		this.current = { ...this.current, ...change };
		this.dispatcher.dispatch("changed");
	}
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
