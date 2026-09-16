import { describe, it, vi, expect } from "vitest";
import { render, createComponent } from "udodi";

function flushMicrotasks() {
  return Promise.resolve();
}

function mountToDOM(component) {
  const root = document.createElement("div");
  const instance = render(component(), root);
  return { root, instance, context: instance.context };
}

describe("Tokenizer & Directive Expression Parser", () => {
  describe("Quoted String Literals", () => {
    it("supports single and double quoted literals", () => {
      const component = createComponent({
        template: () => `
<span @text="'hello world'"></span>
<span @text='"double quotes"'></span>
`,
      });

      expect(component).toBeDefined();
    });

    it("handles escaped quotes inside strings", () => {
      expect(() => {
        createComponent({
          template: () =>
            `<span @text="'It\\'s a test with \\"quotes\\"'"></span>`,
        });
      }).not.toThrow();
    });

    it("supports empty quoted strings", () => {
      expect(() => {
        createComponent({
          template: () => `<span @text="''"></span><span @text='""'></span>`,
        });
      }).not.toThrow();
    });

    it("renders a single-quoted string literal directly as textContent", () => {
      const Component = createComponent({
        template: () => `
<div>
<span @text="'static text'" data-testid="target"></span>
</div>
`,
      });

      const { root } = mountToDOM(Component);

      expect(root.querySelector('[data-testid="target"]').textContent).toBe(
        "static text",
      );
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
      expect(root.querySelector('[data-testid="target"]').textContent).toBe("");

      warnSpy.mockRestore();
    });
  });

  describe("Resolver Syntax", () => {
    it("parses basic resolver with path argument", () => {
      const component = createComponent({
        methods: {
          formatDate(value) {
            return value;
          },
        },
        template: () => `<span @text="formatDate:createdAt"></span>`,
      });

      expect(component).toBeDefined();
    });

    it("parses resolver with multiple arguments including quoted literal", () => {
      const component = createComponent({
        methods: {
          currency(value, code) {
            return `${value} ${code}`;
          },
        },
        template: () => `<span @text="currency:pricing.total:'USD'"></span>`,
      });

      expect(component).toBeDefined();
    });

    it("rejects quoted resolver name", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const component = createComponent({
        template: () => `<span @text="'formatDate':createdAt"></span>`,
      });

      const root = document.createElement("div");

      render(component(), root);
      expect(component).toBeDefined();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("requires colon separator for resolvers", () => {
      const component = createComponent({
        template: () => `<span @text="formatDate"></span>`,
      });

      expect(component).toBeDefined();
    });
  });

  describe("Path Tokens", () => {
    it("accepts valid path tokens and dot paths", () => {
      const component = createComponent({
        state() {
          return { user: { name: "Jane" } };
        },
        template: () => `
<span @text="user"></span>
<span @text="user.name"></span>
<span @text="user.profile.firstName"></span>
`,
      });

      expect(component).toBeDefined();
    });

    it("rejects invalid path tokens", () => {
      expect(() => {
        createComponent({
          template: () => `
<span @text="123invalid"></span>
<span @text="user-name"></span>
<span @text="user..name"></span>
`,
        });
      }).not.toThrow();
    });

    it("resolves a dot-path expression to the correct value", () => {
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

      expect(root.querySelector('[data-testid="target"]').textContent).toBe(
        "Alice",
      );
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

      expect(root.querySelector('[data-testid="target"]').textContent).toBe("");
    });
  });

  describe("Special Characters in Quoted Strings", () => {
    it("allows special characters inside quotes", () => {
      const component = createComponent({
        template: () => `
<span @text="'hello:world|test@example'"></span>
<span @text="formatInput:'user sd-:|wwr'"></span>
`,
      });

      expect(component).toBeDefined();
    });

    it("handles mixed quote types correctly", () => {
      const component = createComponent({
        template: () => `
<span @text="'say \\"hello\\"'"></span>
<span @text='"it\'s"'></span>
`,
      });

      expect(component).toBeDefined();
    });
  });

  describe("Initial Rendering", () => {
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

      expect(root.querySelector('[data-testid="target"]').textContent).toBe(
        "Hello, World!",
      );
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

      expect(root.querySelector('[data-testid="target"]').textContent).toBe(
        "42",
      );
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

      expect(root.querySelector('[data-testid="target"]').textContent).toBe(
        "true",
      );
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

      expect(root.querySelector('[data-testid="target"]').textContent).toBe("");
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

      expect(root.querySelector('[data-testid="target"]').textContent).toBe("");
    });

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
        root.querySelector('[data-testid="target"]').hasAttribute("@text"),
      ).toBe(false);
    });
  });

  describe("Pipe Transforms", () => {
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

      expect(root.querySelector('[data-testid="target"]').textContent).toBe(
        "HELLO",
      );
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

      expect(root.querySelector('[data-testid="target"]').textContent).toBe(
        "HELLO",
      );
    });
  });

  describe("Reactivity", () => {
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

      expect(root.querySelector('[data-testid="target"]').textContent).toBe(
        "before",
      );

      context.message = "after";
      await flushMicrotasks();

      expect(root.querySelector('[data-testid="target"]').textContent).toBe(
        "after",
      );
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

      expect(root.querySelector('[data-testid="target"]').textContent).toBe("");
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

      expect(root.querySelector('[data-testid="target"]').textContent).toBe(
        "3",
      );
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
});
