import type { Resource } from "webappwiz/disposable";
import { Dispatcher, type Eventful } from "webappwiz/events";
import type { LiveMessage } from "../live-take";
import type { TakeSummary } from "../take";
import type { AudioSink } from "./microphone";

export interface LiveSocketEvents extends Record<string, unknown> {
	/** All the take's text so far, rough until it is finished. */
	heard: string;
	/** Why the take broke off. */
	failed: string;
}

/** A take recorded over the server's websocket: audio up, text back. */
export class LiveSocket
	implements AudioSink, Eventful<LiveSocketEvents>, Resource
{
	private readonly dispatcher = new Dispatcher<LiveSocketEvents>();
	readonly events = this.dispatcher.events;
	private finishing: PromiseWithResolvers<TakeSummary> | undefined;
	private failure: string | undefined;
	/** Whether the server kept the take, after which its closing is no failure. */
	private kept = false;

	private constructor(private readonly socket: WebSocket) {
		socket.addEventListener("message", this.receive);
		socket.addEventListener("close", this.closed);
	}

	static async open(url: string): Promise<LiveSocket> {
		const socket = new WebSocket(url);
		await new Promise((resolve, reject) => {
			socket.addEventListener("open", resolve, { once: true });
			socket.addEventListener(
				"error",
				() => reject(new Error("could not reach the dictate server")),
				{ once: true },
			);
		});
		return new LiveSocket(socket);
	}

	send(pcm: Uint8Array<ArrayBuffer>): void {
		if (this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(pcm);
		}
	}

	/** Ends the take, resolving once the server has kept it. */
	finish(): Promise<TakeSummary> {
		if (this.failure !== undefined) {
			return Promise.reject(new Error(this.failure));
		}
		if (this.finishing === undefined) {
			this.finishing = Promise.withResolvers();
			this.socket.send("finish");
		}
		return this.finishing.promise;
	}

	dispose(): void {
		this.socket.removeEventListener("message", this.receive);
		this.socket.removeEventListener("close", this.closed);
		this.socket.close();
		this.dispatcher.dispose();
	}

	private readonly receive = ({ data }: MessageEvent): void => {
		const message = JSON.parse(String(data)) as LiveMessage;
		if (message.type === "heard") {
			this.dispatcher.dispatch("heard", message.text);
		} else if (message.type === "failed") {
			this.fail(message.message);
		} else {
			this.kept = true;
			this.finishing?.resolve(message.take);
		}
	};

	private readonly closed = (): void => {
		this.fail("the dictate server closed the take");
	};

	private fail(message: string): void {
		if (this.failure !== undefined || this.kept) {
			return;
		}
		this.failure = message;
		this.dispatcher.dispatch("failed", message);
		this.finishing?.reject(new Error(message));
	}
}
