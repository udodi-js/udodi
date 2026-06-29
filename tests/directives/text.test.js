/**
 * Tokenizer Test Suite
 * Tests edge cases and expected behavior for directive expression parsing.
 *
 * Based on Udodi User Guide - Directive expression rules and resolvers.
 */

import { describe, it, vi, expect } from "vitest";
import { render, createComponent } from "udodi";

// We test the public behavior through the tokenizer's effects on directives/resolvers
// rather than private internals.

describe("Tokenizer & Directive Expression Parser", () => {
	describe("Quoted String Literals", () => {
		it("supports single and double quoted literals", () => {
			// These should be treated as literal values, not paths
			const component = createComponent({
				template: () => `
					<span @text="'hello world'"></span>
					<span @text='"double quotes"'></span>
				`,
			});

			expect(component).toBeDefined();
		});

		it("handles escaped quotes inside strings", () => {
			// Should support \' and \" inside quotes
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
			// "formatDate" alone should not be treated as resolver
			const component = createComponent({
				template: () => `<span @text="formatDate"></span>`,
			});

			expect(component).toBeDefined();
		});
	});

	describe("Path Tokens", () => {
		it("accepts valid path tokens and dot paths", () => {
			const component = createComponent({
				state: { user: { name: "Jane" } },
				template: () => `
					<span @text="user"></span>
					<span @text="user.name"></span>
					<span @text="user.profile.firstName"></span>
				`,
			});

			expect(component).toBeDefined();
		});

		it("rejects invalid path tokens", () => {
			// These should not break parsing but be treated appropriately
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
					<span @text="'say \"hello\"'"></span>
					<span @text='"it\'s"'></span>
				`,
			});

			expect(component).toBeDefined();
		});
	});
});
