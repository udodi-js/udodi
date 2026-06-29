import { describe, it, expect } from "vitest";

import { lexDirective } from "../../packages/core/lexer.js";
import { parseDirective } from "../../packages/core/parser.js";

import {
	NODE_BINDING,
	NODE_EVENT_BINDING,
	EXPR_LITERAL,
	EXPR_PATH,
	EXPR_CALL,
	EXPR_CONDITIONAL,
	EXPR_PIPELINE,
} from "../../packages/core/expTypes.js";

function parse(input) {
	return parseDirective(lexDirective(input), input);
}

describe("Udodi Parser", () => {
	it("parses a simple path binding", () => {
		const ast = parse("text=user.name");

		const b = ast.bindings[0];

		expect(b.type).toBe(NODE_BINDING);
		expect(b.target).toBe("text");

		expect(b.expr.type).toBe(EXPR_PATH);
		expect(b.expr.key).toBe("user.name");
		expect(b.expr.segments).toEqual(["user", "name"]);
	});

	it("parses a conditional binding", () => {
		const ast = parse("class=isActive=>'active'");

		const expr = ast.bindings[0].expr;

		expect(expr.type).toBe(EXPR_CONDITIONAL);

		expect(expr.condition.type).toBe(EXPR_PATH);

		expect(expr.condition.key).toBe("isActive");

		expect(expr.value.type).toBe(EXPR_LITERAL);

		expect(expr.value.value).toBe("active");
	});

	it("parses conditional pipeline expressions", () => {
		const ast = parse("text=showMessage=>message|uppercase");

		const expr = ast.bindings[0].expr;

		expect(expr.type).toBe(EXPR_PIPELINE);

		expect(expr.steps[0].type).toBe(EXPR_CONDITIONAL);
	});

	it("parses resolver calls", () => {
		const ast = parse("text=formatDate:createdAt:'MMM DD, YYYY'");

		const expr = ast.bindings[0].expr;

		expect(expr.type).toBe(EXPR_CALL);

		expect(expr.name).toBe("formatDate");

		expect(expr.args).toHaveLength(2);
	});

	it("parses event bindings with modifiers", () => {
		const ast = parse("on[click.prevent.stop]=handleClick");

		const binding = ast.bindings[0];

		expect(binding.type).toBe(NODE_EVENT_BINDING);

		expect(binding.event).toBe("click");

		expect(binding.modifiers).toEqual(["prevent", "stop"]);
	});

	it("parses multiple literals", () => {
		const ast = parse("count=42 active=true title='Hello World'");

		expect(ast.bindings).toHaveLength(3);

		expect(ast.bindings[0].expr.value).toBe(42);

		expect(ast.bindings[1].expr.value).toBe(true);

		expect(ast.bindings[2].expr.value).toBe("Hello World");
	});

	it("parses pipelines with resolver calls", () => {
		const ast = parse("href=user.id|formatUrl:'/users/'");

		expect(ast.bindings[0].expr.type).toBe(EXPR_PIPELINE);
	});

	it("handles extra whitespace", () => {
		const ast = parse("   text =   message   |   trim  ");

		expect(ast.bindings).toHaveLength(1);
	});

	it("parses enter key modifier events", () => {
		const ast = parse("on[keydown.enter.stop]=submit:message");

		const binding = ast.bindings[0];

		expect(binding.type).toBe(NODE_EVENT_BINDING);

		expect(binding.event).toBe("keydown");

		expect(binding.modifiers).toEqual(["enter", "stop"]);

		expect(binding.expr.type).toBe(EXPR_CALL);

		expect(binding.expr.name).toBe("submit");
	});
});

describe("Udodi Core Directives", () => {
	it("parses @attr binding", () => {
		const ast = parse("attr[href]=url:user.id");

		const binding = ast.bindings[0];

		expect(binding.type).toBe(NODE_BINDING);

		expect(binding.target).toBe("attr[href]");

		expect(binding.expr.type).toBe(EXPR_CALL);

		expect(binding.expr.name).toBe("url");

		expect(binding.expr.args).toHaveLength(1);

		expect(binding.expr.args[0].type).toBe(EXPR_PATH);

		expect(binding.expr.args[0].key).toBe("user.id");
	});

	it("parses conditional @class binding", () => {
		const ast = parse("class=isActive=>'active'");

		const binding = ast.bindings[0];

		expect(binding.type).toBe(NODE_BINDING);

		expect(binding.target).toBe("class");

		const expr = binding.expr;

		expect(expr.type).toBe(EXPR_CONDITIONAL);

		expect(expr.condition.type).toBe(EXPR_PATH);

		expect(expr.condition.key).toBe("isActive");

		expect(expr.value.type).toBe(EXPR_LITERAL);

		expect(expr.value.value).toBe("active");
	});

	it("parses conditional @style binding", () => {
		const ast = parse("style[display]=isVisible=>'block'");

		const binding = ast.bindings[0];

		expect(binding.type).toBe(NODE_BINDING);

		expect(binding.target).toBe("style[display]");

		const expr = binding.expr;

		expect(expr.type).toBe(EXPR_CONDITIONAL);

		expect(expr.condition.type).toBe(EXPR_PATH);

		expect(expr.condition.key).toBe("isVisible");

		expect(expr.value.type).toBe(EXPR_LITERAL);

		expect(expr.value.value).toBe("block");
	});

	it("parses @on binding with modifiers and arguments", () => {
		const ast = parse("on[click.prevent]=save:user.id");

		const binding = ast.bindings[0];

		expect(binding.type).toBe(NODE_EVENT_BINDING);

		expect(binding.event).toBe("click");

		expect(binding.modifiers).toEqual(["prevent"]);

		expect(binding.expr.type).toBe(EXPR_CALL);

		expect(binding.expr.name).toBe("save");

		expect(binding.expr.args).toHaveLength(1);

		expect(binding.expr.args[0].type).toBe(EXPR_PATH);

		expect(binding.expr.args[0].key).toBe("user.id");
	});

	it("parses multiple bindings in a single directive", () => {
		const ast = parse(
			"attr[href]=url:user.id class=isActive=>'active' style[display]=isVisible:arg=>'block'",
		);

        expect(ast.bindings).toHaveLength(3);

		expect(ast.bindings[0].target).toBe("attr[href]");

		expect(ast.bindings[1].target).toBe("class");

		expect(ast.bindings[2].target).toBe("style[display]");
	});
});
