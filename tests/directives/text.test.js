/**
 * @text Directive Test Suite
 *
 * Verifies the runtime behavior of the @text directive as implemented in
 * packages/runtime/bindDOM.js (processTextDirective).
 *
 * Behavior under test:
 * - Renders a state value as textContent
 * - Updates reactively when state changes
 * - Handles null/undefined by rendering empty string
 * - Supports dot-path expressions (e.g. user.name)
 * - Supports quoted string literals (@text="'hello'")
 * - Supports pipe transforms (@text="message|uppercase")
 * - Warns on invalid quoted usage and renders empty string
 * - Strips the @text attribute after processing
 */

import { describe, it, expect, vi } from "vitest";
import { render, createComponent } from "udodi";

function flushMicrotasks() {
  return Promise.resolve();
}

function mountToDOM(component) {
  const root = document.createElement("div");
  const instance = render(component(), root);
  return { root, instance, context: instance.context };
}

describe("@text directive", () => {

  // ─── Initial rendering ───────────────────────────────────────────────────

  it("renders a string state value as textContent", () => {
    const Component = createComponent({
      state() {
        return { message: "Hello, World!" };
      },
      template: () => `
        <div>
          <span @text="message" data-testid="target"></span>
        </div>
      `,
    });

    const { root } = mountToDOM(Component);

    expect(
      root.querySelector('[data-testid="target"]').textContent
    ).toBe("Hello, World!");
  });

  it("renders a number state value as a string", () => {
    const Component = createComponent({
      state() {
        return { count: 42 };
      },
      template: () => `
        <div>
          <span @text="count" data-testid="target"></span>
        </div>
      `,
    });

    const { root } = mountToDOM(Component);

    expect(
      root.querySelector('[data-testid="target"]').textContent
    ).toBe("42");
  });

  it("renders a boolean state value as a string", () => {
    const Component = createComponent({
      state() {
        return { flag: true };
      },
      template: () => `
        <div>
          <span @text="flag" data-testid="target"></span>
        </div>
      `,
    });

    const { root } = mountToDOM(Component);

    expect(
      root.querySelector('[data-testid="target"]').textContent
    ).toBe("true");
  });

  it("renders empty string for a null value", () => {
    const Component = createComponent({
      state() {
        return { value: null };
      },
      template: () => `
        <div>
          <span @text="value" data-testid="target"></span>
        </div>
      `,
    });

    const { root } = mountToDOM(Component);

    expect(
      root.querySelector('[data-testid="target"]').textContent
    ).toBe("");
  });

  it("renders empty string for an undefined value", () => {
    const Component = createComponent({
      state() {
        return {};
      },
      template: () => `
        <div>
          <span @text="missing" data-testid="target"></span>
        </div>
      `,
    });

    const { root } = mountToDOM(Component);

    expect(
      root.querySelector('[data-testid="target"]').textContent
    ).toBe("");
  });

  // ─── Dot-path expressions ────────────────────────────────────────────────

  it("resolves a dot-path expression", () => {
    const Component = createComponent({
      state() {
        return { user: { name: "Alice" } };
      },
      template: () => `
        <div>
          <span @text="user.name" data-testid="target"></span>
        </div>
      `,
    });

    const { root } = mountToDOM(Component);

    expect(
      root.querySelector('[data-testid="target"]').textContent
    ).toBe("Alice");
  });

  it("renders empty string for a missing nested path", () => {
    const Component = createComponent({
      state() {
        return {};
      },
      template: () => `
        <div>
          <span @text="user.name" data-testid="target"></span>
        </div>
      `,
    });

    const { root } = mountToDOM(Component);
    expect(
      root.querySelector('[data-testid="target"]').textContent
    ).toBe("");
  });

  // ─── Quoted string literals ──────────────────────────────────────────────

  it("renders a single-quoted string literal directly", () => {
    const Component = createComponent({
      template: () => `
        <div>
          <span @text="'static text'" data-testid="target"></span>
        </div>
      `,
    });

    const { root } = mountToDOM(Component);

    expect(
      root.querySelector('[data-testid="target"]').textContent
    ).toBe("static text");
  });

  it("warns and renders empty string for invalid partial-quoted usage", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const Component = createComponent({
      template: () => `
        <div>
          <span @text="'bad" data-testid="target"></span>
        </div>
      `,
    });

    const { root } = mountToDOM(Component);

    expect(warnSpy).toHaveBeenCalled();
    expect(
      root.querySelector('[data-testid="target"]').textContent
    ).toBe("");

    warnSpy.mockRestore();
  });

  // ─── Pipe transforms ─────────────────────────────────────────────────────

  it("applies a pipe method transform to the value", () => {
    const Component = createComponent({
      state() {
        return { message: "hello" };
      },
      methods: {
        uppercase(value) {
          return value.toUpperCase();
        },
      },
      template: () => `
        <div>
          <span @text="message|uppercase" data-testid="target"></span>
        </div>
      `,
    });

    const { root } = mountToDOM(Component);

    expect(
      root.querySelector('[data-testid="target"]').textContent
    ).toBe("HELLO");
  });

  it("applies chained pipe methods in order", () => {
    const Component = createComponent({
      state() {
        return { message: "  hello  " };
      },
      methods: {
        trim(value) {
          return value.trim();
        },
        uppercase(value) {
          return value.toUpperCase();
        },
      },
      template: () => `
        <div>
          <span @text="message|trim|uppercase" data-testid="target"></span>
        </div>
      `,
    });

    const { root } = mountToDOM(Component);

    expect(
      root.querySelector('[data-testid="target"]').textContent
    ).toBe("HELLO");
  });

  // ─── Attribute cleanup ───────────────────────────────────────────────────

  it("strips the @text attribute from the element after processing", () => {
    const Component = createComponent({
      state() {
        return { message: "hello" };
      },
      template: () => `
        <div>
          <span @text="message" data-testid="target"></span>
        </div>
      `,
    });

    const { root } = mountToDOM(Component);

    expect(
      root.querySelector('[data-testid="target"]').hasAttribute("@text")
    ).toBe(false);
  });

  // ─── Reactivity ──────────────────────────────────────────────────────────

  it("updates textContent when state changes", async () => {
    const Component = createComponent({
      state() {
        return { message: "before" };
      },
      template: () => `
        <div>
          <span @text="message" data-testid="target"></span>
        </div>
      `,
    });

    const { root, context } = mountToDOM(Component);

    expect(
      root.querySelector('[data-testid="target"]').textContent
    ).toBe("before");

    context.message = "after";
    await flushMicrotasks();

    expect(
      root.querySelector('[data-testid="target"]').textContent
    ).toBe("after");
  });

  it("updates to empty string when state becomes null", async () => {
    const Component = createComponent({
      state() {
        return { message: "hello" };
      },
      template: () => `
        <div>
          <span @text="message" data-testid="target"></span>
        </div>
      `,
    });

    const { root, context } = mountToDOM(Component);

    context.message = null;
    await flushMicrotasks();
    expect(
      root.querySelector('[data-testid="target"]').textContent
    ).toBe("");
  });

  it("handles rapid successive state changes correctly", async () => {
    const Component = createComponent({
      state() {
        return { count: 0 };
      },
      template: () => `
        <div>
          <span @text="count" data-testid="target"></span>
        </div>
      `,
    });

    const { root, context } = mountToDOM(Component);

    context.count = 1;
    context.count = 2;
    context.count = 3;
    await flushMicrotasks();

    expect(
      root.querySelector('[data-testid="target"]').textContent
    ).toBe("3");
  });

  it("keeps multiple @text bindings in sync independently", async () => {
    const Component = createComponent({
      state() {
        return { a: "foo", b: "bar" };
      },
      template: () => `
        <div>
          <span @text="a" data-testid="a"></span>
          <span @text="b" data-testid="b"></span>
        </div>
      `,
    });

    const { root, context } = mountToDOM(Component);

    context.a = "baz";
    await flushMicrotasks();

    expect(root.querySelector('[data-testid="a"]').textContent).toBe("baz");
    expect(root.querySelector('[data-testid="b"]').textContent).toBe("bar");
  });
});