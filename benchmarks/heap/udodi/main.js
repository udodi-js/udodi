import { render } from "../../../dist/index.js";
import { App } from "./App.js";

const instance = render(App(), "#app");

window.createApplication = () => ({
	update(index) {
		instance.context.updateRow(index);
	},
	destroy() {
		instance.unmount();
	},
});
