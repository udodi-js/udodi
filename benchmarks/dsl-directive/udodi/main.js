import { render } from "../../../dist/index.js";
import { DirectiveApp } from "../../fixtures/dsl.js";

window.mountApplication = () => render(DirectiveApp(), "#app");
