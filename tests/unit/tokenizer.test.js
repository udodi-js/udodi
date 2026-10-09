/**
 * Tokenizer Test Suite
 * Tests edge cases and expected behavior for directive expression parsing.
 */

import { describe, it, expect } from "vitest";
import {
	isQuote,
	isQuotedString,
	unquoteString,
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
	});
});
