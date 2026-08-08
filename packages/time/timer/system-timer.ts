import { type Disposable, disposables } from "@webappwiz/disposable";
import type { Duration } from "../duration";
import type { Timer } from "./timer";

export class SystemTimer implements Timer {
	setTimeout(callback: () => void, delay: Duration): Disposable {
		const id = setTimeout(callback, delay.ms);
		return disposables.callback(() => clearTimeout(id));
	}

	setInterval(callback: () => void, interval: Duration): Disposable {
		const id = setInterval(callback, interval.ms);
		return disposables.callback(() => clearInterval(id));
	}
}
