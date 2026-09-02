import { createComponent, html } from "../../dist/index.js";
import { compile } from "../../packages/core/compiler.js";
import { lexDirective } from "../../packages/core/lexer.js";
import { parseDirective } from "../../packages/core/parser.js";
import { VM } from "../../packages/core/vm.js";
import { stdlib } from "../../packages/stdlib/index.js";

export const EXPRESSIONS = [
    "name",
    "user.profile.email",
    "42",
    "'Hello'",
    "true",
    "formatDate:createdAt",
    "formatDate:createdAt:'yyyy-MM-dd'",
    "add:a:b",
    "name | capitalise",
    "value | trim | upper",
    "createdAt | formatDate:'MMM DD'",
    "isActive=>'active'",
    "user.name | trim | capitalise",
];

export function parseExpression(expression) {
    const source = `text=${expression}`;
    return parseDirective(lexDirective(source), source);
}

export function compileExpression(expression) {
    return compile(parseExpression(expression));
}

export function createDSLContext() {
    return {
        ...stdlib,
        name: "celestine",
        user: { name: " Celestine ", profile: { email: "user@example.com" } },
        createdAt: "2026-09-01",
        value: "  hello world  ",
        isActive: true,
        formatDate(value, format) { return `${format}:${value}`; },
        add(a, b) { return a + b; },
        a: 10,
        b: 20,
    };
}

export function createDSLState() {
    return {
        user: { name: " Celestine ", profile: { email: "user@example.com" } },
        createdAt: "2026-09-01",
        value: "  hello world  ",
        isActive: true,
        a: 10,
        b: 20,
    };
}

export function evaluateExpression(expression, context = createDSLContext()) {
    const instructions = compileExpression(expression);
    return new VM(context).evaluate(instructions[0].expr, context);
}

const directiveRows = Array.from({ length: 1000 }, (_, index) => `
    <li>
        <span @text="user.profile.email"></span>
        <span @text="formatDate:createdAt:'yyyy-MM-dd'"></span>
        <span @text="value | trim | upper"></span>
        <span @text="isActive=>'active'"></span>
        <span @text="${index}"></span>
    </li>
`).join("");

export const DirectiveApp = createComponent({
    name: "DSLDirectiveBenchmark",
    state: createDSLState,
    methods: {
        formatDate(value, format) { return `${format}:${value}`; },
    },
    template: () => html`<main><ul>${directiveRows}</ul></main>`,
});
