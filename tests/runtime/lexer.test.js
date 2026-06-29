import { describe, it, expect } from "vitest";
import { lexDirective } from "../../packages/core/lexer.js";
import {
	TOKEN_EOF,
	TOKEN_PATH,
	TOKEN_STRING,
	TOKEN_NUMBER,
	TOKEN_BOOLEAN,
	TOKEN_COLON,
	TOKEN_PIPE,
	TOKEN_EQUAL,
	TOKEN_ARROW,
	TOKEN_NAMES,
} from "../../packages/core/tokens.js";

/**
 * Helper to make tests more readable
 */
function tokenize(str) {
	return lexDirective(str).map(([type, start, end]) => ({
		type: TOKEN_NAMES[type] || type,
		value: str.slice(start, end),
		start,
		end,
	}));
}

describe("Udodi Lexer", () => {
	it("should lex simple paths", () => {
		const result = tokenize("user.firstName");
		expect(result).toEqual([
			{ type: "PATH", value: "user.firstName", start: 0, end: 14 },
			{ type: "EOF", value: "", start: 14, end: 14 },
		]);
	});

	it("should lex @text examples", () => {
		expect(tokenize("count")[0].type).toBe("PATH");
		expect(tokenize("fullName")[0].type).toBe("PATH");
		expect(tokenize("user.firstName")[0].type).toBe("PATH");
	});

	it("should lex resolver calls with arguments", () => {
		const result = tokenize("formatDate:createdAt:'MMM DD, YYYY'");
		expect(result).toEqual([
			{ type: "PATH", value: "formatDate", start: 0, end: 10 },
			{ type: "COLON", value: ":", start: 10, end: 11 },
			{ type: "PATH", value: "createdAt", start: 11, end: 20 },
			{ type: "COLON", value: ":", start: 20, end: 21 },
			{ type: "STRING", value: "'MMM DD, YYYY'", start: 21, end: 35 },
			{ type: "EOF", value: "", start: 35, end: 35 },
		]);
	});

	it("should handle @class with quoted class names", () => {
		const input = "'active':isActive 'disabled':isDisabled";
		const result = tokenize(input);

		expect(result).toEqual([
			{ type: "STRING", value: "'active'", start: 0, end: 8 },
			{ type: "COLON", value: ":", start: 8, end: 9 },
			{ type: "PATH", value: "isActive", start: 9, end: 17 },
			{ type: "STRING", value: "'disabled'", start: 18, end: 28 },
			{ type: "COLON", value: ":", start: 28, end: 29 },
			{ type: "PATH", value: "isDisabled", start: 29, end: 39 },
			{ type: "EOF", value: "", start: 39, end: 39 },
		]);
	});

	it("should lex currency resolver", () => {
		const result = tokenize("currency:pricing.total:'USD'");
		expect(result.map((t) => t.type)).toEqual([
			"PATH",
			"COLON",
			"PATH",
			"COLON",
			"STRING",
			"EOF",
		]);
	});

	it("should lex equal operator (=)", () => {
		const result = tokenize("value=42");
		expect(result).toEqual([
			{ type: "PATH", value: "value", start: 0, end: 5 },
			{ type: "EQUAL", value: "=", start: 5, end: 6 },
			{ type: "NUMBER", value: "42", start: 6, end: 8 },
			{ type: "EOF", value: "", start: 8, end: 8 },
		]);
	});

	it("should lex arrow operator (=>)", () => {
		const result = tokenize("item => item.name");
		expect(result).toEqual([
			{ type: "PATH", value: "item", start: 0, end: 4 },
			{ type: "ARROW", value: "=>", start: 5, end: 7 },
			{ type: "PATH", value: "item.name", start: 8, end: 17 },
			{ type: "EOF", value: "", start: 17, end: 17 },
		]);
	});

	it("should lex equal and arrow in complex expressions", () => {
		const cases = [
			"status=active",
			"handler => console.log(item)",
			"onClick => toggle()",
		];

		cases.forEach((expr) => {
			const tokens = tokenize(expr);
			expect(tokens.some((t) => t.type === "EQUAL" || t.type === "ARROW")).toBe(
				true,
			);
		});
	});

	it("should handle quoted strings with special characters", () => {
		const cases = [
			"url:'https://www.example.com'",
			"formatInput:'user sd-:|wwr'",
			"message:'It\\'s a test with \"quotes\"'",
		];

		cases.forEach((expr) => {
			const tokens = tokenize(expr);
			expect(tokens.some((t) => t.type === "STRING")).toBe(true);
			expect(tokens.some((t) => t.type === "PATH")).toBe(true);
		});
	});

	it("should lex multiple space-separated expressions (for @on, @class, etc.)", () => {
		const result = tokenize("keydown.enter:search keydown.esc:clear");
		expect(result.length).toBeGreaterThan(5);
		expect(result.some((t) => t.type === "COLON")).toBe(true);
	});

	it("should lex booleans and numbers", () => {
		expect(tokenize("true")[0].type).toBe("BOOLEAN");
		expect(tokenize("false")[0].type).toBe("BOOLEAN");
		expect(tokenize("42")[0].type).toBe("NUMBER");
		expect(tokenize("3.14")[0].type).toBe("NUMBER");
	});

	it("should handle empty / whitespace input", () => {
		expect(tokenize("")[0].type).toBe("EOF");
		expect(tokenize("   ")[0].type).toBe("EOF");
	});

	it("should throw on unclosed quotes", () => {
		expect(() => lexDirective("hello: 'unclosed")).toThrow(
			/Unclosed quoted string/,
		);
	});

	it("does not classify boolean prefixes", () => {
		expect(tokenize("trueValue")[0].type).toBe("PATH");
		expect(tokenize("falseFlag")[0].type).toBe("PATH");
	});

	it("lexes standalone string literals", () => {
		const result = tokenize("'hello world'");
		expect(result.map((t) => t.type)).toEqual(["STRING", "EOF"]);
	});

	it("lexes pipes", () => {
		const result = tokenize("formatDate:user.createdAt | uppercase");
		expect(result.map((t) => t.type)).toEqual([
			"PATH",
			"COLON",
			"PATH",
			"PIPE",
			"PATH",
			"EOF",
		]);
	});

	it("does not classify invalid numbers", () => {
		expect(tokenize(".5")[0].type).toBe("PATH");
		expect(tokenize("5.")[0].type).toBe("PATH");
		expect(tokenize("1e3")[0].type).toBe("PATH");
	});
});
