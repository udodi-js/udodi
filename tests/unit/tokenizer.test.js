/**
 * Tokenizer Test Suite
 * Tests edge cases and expected behavior for directive expression parsing.
 */

import { describe, it, expect } from "vitest";
import {
	isQuote,
	isEscaped,
	isQuotedString,
	unquoteString,
	splitUnquoted,
	splitBindingsBySpace,
	splitFirstUnquoted,
	isPathToken,
	isPathPath,
	classifyToken,
	tokenFrom,
	parseResolver,
	scanQuoted,
	SCAN_DELIMITER,
	SCAN_WHITESPACE,
} from "../../packages/utils/tokenizer.js";

describe("Tokenizer", () => {
	describe("isQuote", () => {
		it("identifies quote characters", () => {
			expect(isQuote("'")).toBe(true);
			expect(isQuote('"')).toBe(true);
			expect(isQuote("a")).toBe(false);
			expect(isQuote(" ")).toBe(false);
		});
	});

	describe("isEscaped", () => {
		it("detects escaped characters", () => {
			expect(isEscaped("'it\\'s'", 4)).toBe(true);
			expect(isEscaped('"say \\"hello"', 6)).toBe(true);
			expect(isEscaped("no escape", 2)).toBe(false);
		});
	});

	describe("isQuotedString", () => {
		it("simple single quotes", () => {
			expect(isQuotedString("'hello'")).toBe(true);
			expect(isQuotedString("'hello")).toBe(false);
			expect(isQuotedString("hello'")).toBe(false);
		});

		it("simple double quotes", () => {
			expect(isQuotedString('"hello"')).toBe(true);
			expect(isQuotedString('"hello')).toBe(false);
		});

		it("mixed quote types", () => {
			expect(isQuotedString("'hello\"")).toBe(false);
			expect(isQuotedString("\"hello'")).toBe(false);
		});

		it("escaped quotes inside", () => {
			expect(isQuotedString("'it\\'s'")).toBe(true);
			expect(isQuotedString('"it\\"s"')).toBe(true);
		});

		it("empty quotes", () => {
			expect(isQuotedString("''")).toBe(true);
			expect(isQuotedString('""')).toBe(true);
		});
	});

	describe("unquoteString", () => {
		it("basic unquoting", () => {
			expect(unquoteString("'hello'")).toBe("hello");
			expect(unquoteString('"world"')).toBe("world");
		});

		it("unescape quotes", () => {
			expect(unquoteString("'it\\'s'")).toBe("it's");
			expect(unquoteString('"say \\"hello\\""')).toBe('say "hello"');
		});

		it("non-quoted strings pass through", () => {
			expect(unquoteString("hello")).toBe("hello");
		});
	});

	describe("scanQuoted", () => {
		it("delimiter mode - splits on delimiter outside quotes", () => {
			const tokens = [];
			scanQuoted("a,b,'c,d',e", (s, e) => tokens.push("a,b,'c,d',e".slice(s, e)), SCAN_DELIMITER, ",");
			expect(tokens).toEqual(["a", "b", "'c,d'", "e"]);
		});

		it("whitespace mode - splits on whitespace outside quotes", () => {
			const tokens = [];
			scanQuoted("foo bar 'hello world'  baz", (s, e) => tokens.push("foo bar 'hello world'  baz".slice(s, e)), SCAN_WHITESPACE);
			expect(tokens).toEqual(["foo", "bar", "'hello world'", "baz"]);
		});

		it("throws on unclosed quote", () => {
			expect(() => {
				const tokens = [];
				scanQuoted("'unclosed string", (s, e) => tokens.push(""), SCAN_DELIMITER, ",");
			}).toThrow(/Unclosed quoted string/);
		});
	});

	describe("splitUnquoted", () => {
		it("splits on separator while ignoring content inside quotes", () => {
			expect(splitUnquoted("a,b,'c,d',e", ",")).toEqual([
				"a",
				"b",
				"'c,d'",
				"e",
			]);
			expect(splitUnquoted("name:'John Doe',age:30", ",")).toEqual([
				"name:'John Doe'",
				"age:30",
			]);
		});

		it("works with colon separator", () => {
			expect(splitUnquoted("formatDate:createdAt:'MMM DD, YYYY'", ":")).toEqual([
				"formatDate",
				"createdAt",
				"'MMM DD, YYYY'",
			]);
		});

		it("returns original string when no separator found", () => {
			expect(splitUnquoted("singleToken", ",")).toEqual(["singleToken"]);
		});

		it("handles empty string", () => {
			expect(splitUnquoted("", ",")).toEqual([]);
		});

		it("preserves empty tokens", () => {
			expect(splitUnquoted("a,,b", ",")).toEqual(["a", "", "b"]);
		});
	});

	describe("splitBindingsBySpace", () => {
		it("multiple space-separated bindings", () => {
			const result = splitBindingsBySpace("item:index todos");
			expect(result).toEqual(["item:index", "todos"]);
		});

		it("respects quoted strings with spaces", () => {
			const result = splitBindingsBySpace('foo "bar baz" qux');
			expect(result).toEqual(['foo', '"bar baz"', 'qux']);
		});
	});

	describe("splitFirstUnquoted", () => {
		it("splits on first delimiter outside quotes", () => {
			expect(splitFirstUnquoted("key:value", ":")).toEqual(["key", "value"]);
			expect(splitFirstUnquoted("name:'John Doe'", ":")).toEqual(["name", "'John Doe'"]);
		});

		it("returns single item if no delimiter", () => {
			expect(splitFirstUnquoted("singleToken", ":")).toEqual(["singleToken"]);
		});
	});

	describe("isPathToken", () => {
		it("valid identifiers", () => {
			expect(isPathToken("user")).toBe(true);
			expect(isPathToken("_private")).toBe(true);
			expect(isPathToken("$special")).toBe(true);
			expect(isPathToken("User123")).toBe(true);
		});

		it("invalid identifiers", () => {
			expect(isPathToken("123user")).toBe(false);
			expect(isPathToken("user-name")).toBe(false);
			expect(isPathToken("user.name")).toBe(false);
			expect(isPathToken("")).toBe(false);
		});
	});

	describe("isPathPath", () => {
		it("single and nested valid paths", () => {
			expect(isPathPath("user")).toBe(true);
			expect(isPathPath("user.name")).toBe(true);
			expect(isPathPath("user.profile.firstName")).toBe(true);
		});

		it("invalid paths", () => {
			expect(isPathPath("user.")).toBe(false);
			expect(isPathPath(".user")).toBe(false);
			expect(isPathPath("user..name")).toBe(false);
			expect(isPathPath("user-name")).toBe(false);
		});
	});

	describe("classifyToken", () => {
		it("quoted literals", () => {
			const result = classifyToken("'hello'");
			expect(result.type).toBe("literal");
			expect(result.value).toBe("hello");
		});

		it("paths", () => {
			const result = classifyToken("user.name");
			expect(result.type).toBe("path");
			expect(result.value).toBe("user.name");
		});

		it("invalid tokens", () => {
			expect(classifyToken("").type).toBe("invalid");
			expect(classifyToken("123invalid").type).toBe("invalid");
			expect(classifyToken("user-name").type).toBe("invalid");
		});
	});

	describe("tokenFrom", () => {
		it("converts raw token to structured token", () => {
			const t1 = tokenFrom("'hello world'");
			expect(t1.raw).toBe("'hello world'");
			expect(t1.value).toBe("hello world");
			expect(t1.quoted).toBe(true);

			const t2 = tokenFrom("user.name");
			expect(t2.raw).toBe("user.name");
			expect(t2.value).toBe("user.name");
			expect(t2.quoted).toBe(false);
		});
	});

	describe("parseResolver", () => {
		it("basic resolver", () => {
			const result = parseResolver("formatDate:createdAt");
			expect(result).not.toBeNull();
			expect(result.resolver).toBe("formatDate");
			expect(result.args).toHaveLength(1);
			expect(result.args[0].value).toBe("createdAt");
		});

		it("resolver with multiple args", () => {
			const result = parseResolver("currency:pricing.total:'USD'");
			expect(result).not.toBeNull();
			expect(result.resolver).toBe("currency");
			expect(result.args).toHaveLength(2);
			expect(result.args[0].value).toBe("pricing.total");
			expect(result.args[1].value).toBe("USD");
		});

		it("quoted resolver name (invalid)", () => {
			const result = parseResolver("'formatDate':arg");
			expect(result).toBeNull();
		});

		it("no args (invalid)", () => {
			const result = parseResolver("formatDate");
			expect(result).toBeNull();
		});
	});

	describe("Edge Cases", () => {
		it("special characters in quoted strings", () => {
			expect(splitUnquoted("'hello:world|test@example'", "|")).toEqual([
				"'hello:world|test@example'"
			]);
		});

		it("nested quote types in string literals", () => {
			expect(isQuotedString("'say \"hello\"'")).toBe(true);
			expect(unquoteString("'say \"hello\"'")).toBe('say "hello"');

			expect(isQuotedString('"it\'s"')).toBe(true);
			expect(unquoteString('"it\'s"')).toBe("it's");
		});

		it("empty tokens and trailing delimiter", () => {
			expect(splitUnquoted("a,b,", ",")).toEqual(["a", "b", ""]);
		});
	});
});
