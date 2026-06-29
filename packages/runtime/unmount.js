import { unmountFunctions } from "./lifecycle.js";

export function unmount(container) {
    const root = container.firstElementChild;

    const unmountFn = unmountFunctions.get(root);
    if (unmountFn) {
        unmountFn();
    }

    container.innerHTML = "";
}