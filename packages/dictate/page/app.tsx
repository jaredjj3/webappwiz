import { useReactive, useResource } from "@webappwiz/react";
import { useEffect } from "react";
import type { DictateApi } from "./dictate-api";
import { DictationController } from "./dictation-controller";
import { LiveText } from "./live-text";
import type { Microphone } from "./microphone";
import { RecordButton } from "./record-button";
import { TakeList } from "./take-list";

export interface AppProps {
	microphone: Microphone;
	api: DictateApi;
}

/** The playground's one page. */
export function App({ microphone, api }: AppProps) {
	const dictation = useResource(
		() => new DictationController(microphone, api),
		[microphone, api],
	);
	const error = useReactive(dictation, (each) => each.state.error, ["changed"]);
	useEffect(() => {
		dictation.load();
	}, [dictation]);
	return (
		<main>
			<h1>Dictate</h1>
			<RecordButton dictation={dictation} />
			<LiveText dictation={dictation} />
			{error !== undefined && (
				<p className="error" role="alert">
					{error}
				</p>
			)}
			<TakeList dictation={dictation} api={api} />
		</main>
	);
}
