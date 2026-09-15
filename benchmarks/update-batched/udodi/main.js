import { render } from "../../../dist/index.js";
import { App } from "../../heap/udodi/App.js";

const instance = render(App(), "#app");

window.updateApplication = () => ({
    update(index) {
        instance.context.updateRow(index);
    },
    destroy() {
        instance.unmount();
    },
});
