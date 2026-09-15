import { render } from "../../../dist/index.js";
import { App } from "../../fixtures/css-scope/App.js";

window.mountApplication = () => render(App(), "#app");
