import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { BrowserMicrophone } from "./browser-microphone";
import { DictateApi } from "./dictate-api";

const root = document.getElementById("root");
if (root === null) {
	throw new Error("index.html has no #root");
}
createRoot(root).render(
	<StrictMode>
		<App
			microphone={new BrowserMicrophone()}
			api={new DictateApi(new URL(location.origin))}
		/>
	</StrictMode>,
);
