import { createComponent, css, html } from "../../../dist/index.js";

const COMPONENT_COUNT = 100;
const SELECTOR_COUNT = 50;

function createScopedComponent(componentIndex) {
    const selectors = Array.from({ length: SELECTOR_COUNT }, (_, selectorIndex) => `
        .card-${componentIndex} .selector-${selectorIndex} {
            color: rgb(${selectorIndex % 255}, ${(selectorIndex * 3) % 255}, ${(selectorIndex * 7) % 255});
            padding: ${selectorIndex % 8}px;
        }
    `).join("");

    return createComponent({
        name: `CssScopeCard${componentIndex}`,
        style: css`${selectors}`,
        template: () => html`
            <article class="card-${componentIndex}">
                <h2 class="selector-0">Card ${componentIndex}</h2>
                <p class="selector-1">Scoped component content</p>
                <span class="selector-2">${componentIndex}</span>
            </article>
        `,
    });
}

const scopedComponents = Array.from(
    { length: COMPONENT_COUNT },
    (_, componentIndex) => createScopedComponent(componentIndex),
);

export const App = createComponent({
    name: "CssScopeBenchmark",
    template: () => html`<main>${scopedComponents.map((Component) => Component()).join("")}</main>`,
});
