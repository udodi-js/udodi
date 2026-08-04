import { render } from "udodi";
import { App } from "./components/App.js";

const root = document.getElementById("root");

console.log("Starting playground render...");

performance.mark("render-start");

render(App(), root);

performance.mark("render-end");

const measure = performance.measure(
	"Udodi Playground Render",
	"render-start",
	"render-end",
);

console.log(`Playground render completed in ${measure.duration.toFixed(2)}ms`);
