import { render } from "../../../dist/index.js";
import { App } from "../../heap/udodi/App.js";

window.mountApplication = () => render(App(), "#app");
