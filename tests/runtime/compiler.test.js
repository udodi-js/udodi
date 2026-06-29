import { describe, it, expect } from "vitest";

import { compile } from "../../packages/core/compiler.js";

import {
	OP_EVAL,
	OP_SET,
	OP_EVENT_BIND,
} from "../../packages/core/opcodes.js";

import {
	EXPR_LITERAL,
	EXPR_PATH,
	EXPR_CALL,
	EXPR_CONDITIONAL,
	EXPR_PIPELINE,
	NODE_DIRECTIVE,
	NODE_BINDING,
	NODE_EVENT_BINDING,
} from "../../packages/core/expTypes.js";

import { MOD_PREVENT } from "../../packages/core/modifiers.js";

describe("compiler", () => {
	describe("binding compilation", () => {
		it("compiles a literal binding", () => {
			const ast = {
				type: NODE_DIRECTIVE,
				bindings: [
					{
						type: NODE_BINDING,
						target: "text",
						expr: {
							type: EXPR_LITERAL,
							value: "hello",
						},
					},
				],
			};

			expect(compile(ast)).toEqual([
				{
					op: OP_EVAL,
					expr: {
						type: EXPR_LITERAL,
						value: "hello",
					},
				},
				{
					op: OP_SET,
					target: "text",
				},
			]);
		});

		it("compiles a path binding", () => {
			const ast = {
				type: NODE_DIRECTIVE,
				bindings: [
					{
						type: NODE_BINDING,
						target: "text",
						expr: {
							type: EXPR_PATH,
							key: "user.name",
							segments: ["user", "name"],
						},
					},
				],
			};

			expect(compile(ast)).toEqual([
				{
					op: OP_EVAL,
					expr: {
						type: EXPR_PATH,
						key: "user.name",
						segments: ["user", "name"],
					},
				},
				{
					op: OP_SET,
					target: "text",
				},
			]);
		});

		it("compiles a function call binding", () => {
			const ast = {
				type: NODE_DIRECTIVE,
				bindings: [
					{
						type: NODE_BINDING,
						target: "attr[href]",
						expr: {
							type: EXPR_CALL,
							name: "url",
							args: [
								{
									type: EXPR_PATH,
									key: "user.id",
									segments: ["user", "id"],
								},
							],
						},
					},
				],
			};

			expect(compile(ast)).toEqual([
				{
					op: OP_EVAL,
					expr: {
						type: EXPR_CALL,
						name: "url",
						args: [
							{
								type: EXPR_PATH,
								key: "user.id",
								segments: ["user", "id"],
							},
						],
					},
				},
				{
					op: OP_SET,
					target: "attr[href]",
				},
			]);
		});

		it("compiles a conditional binding", () => {
			const ast = {
				type: NODE_DIRECTIVE,
				bindings: [
					{
						type: NODE_BINDING,
						target: "class",
						expr: {
							type: EXPR_CONDITIONAL,
							condition: {
								type: EXPR_PATH,
								key: "isActive",
								segments: ["isActive"],
							},
							value: {
								type: EXPR_LITERAL,
								value: "active",
							},
						},
					},
				],
			};

			expect(compile(ast)).toEqual([
				{
					op: OP_EVAL,
					expr: {
						type: EXPR_CONDITIONAL,
						condition: {
							type: EXPR_PATH,
							key: "isActive",
							segments: ["isActive"],
						},
						value: {
							type: EXPR_LITERAL,
							value: "active",
						},
					},
				},
				{
					op: OP_SET,
					target: "class",
				},
			]);
		});
	});

	describe("event bindings", () => {
		it("compiles an event binding", () => {
			const ast = {
				type: NODE_DIRECTIVE,
				bindings: [
					{
						type: NODE_EVENT_BINDING,
						event: "click",
						modifiers: ["prevent"],
						expr: {
							type: EXPR_CALL,
							name: "save",
							args: [],
						},
					},
				],
			};

			expect(compile(ast)).toEqual([
				{
					op: OP_EVENT_BIND,
					event: "click",
					modifiers: MOD_PREVENT, // 1
					expr: {
						type: EXPR_CALL,
						name: "save",
						args: [],
					},
				},
			]);
		});

		it("compiles an event binding with multiple modifiers", () => {
			const ast = {
				type: NODE_DIRECTIVE,
				bindings: [
					{
						type: NODE_EVENT_BINDING,
						event: "keydown",
						modifiers: ["stop", "self", "once"],
						expr: {
							type: EXPR_PATH,
							key: "handleKey",
							segments: ["handleKey"],
						},
					},
				],
			};

			expect(compile(ast)).toEqual([
				{
					op: OP_EVENT_BIND,
					event: "keydown",
					modifiers: 2 | 4 | 512, // MOD_STOP | MOD_SELF | MOD_ONCE
					expr: {
						type: EXPR_PATH,
						key: "handleKey",
						segments: ["handleKey"],
					},
				},
			]);
		});
	});

	describe("pipeline lowering", () => {
		it("lowers a single-step pipeline", () => {
			const ast = {
				type: NODE_DIRECTIVE,
				bindings: [
					{
						type: NODE_BINDING,
						target: "text",
						expr: {
							type: EXPR_PIPELINE,
							steps: [
								{
									type: EXPR_PATH,
									key: "user.id",
									segments: ["user", "id"],
								},
							],
						},
					},
				],
			};

			expect(compile(ast)).toEqual([
				{
					op: OP_EVAL,
					expr: {
						type: EXPR_PATH,
						key: "user.id",
						segments: ["user", "id"],
					},
				},
				{
					op: OP_SET,
					target: "text",
				},
			]);
		});

		it("lowers a two-step pipeline", () => {
			const ast = {
				type: NODE_DIRECTIVE,
				bindings: [
					{
						type: NODE_BINDING,
						target: "text",
						expr: {
							type: EXPR_PIPELINE,
							steps: [
								{
									type: EXPR_PATH,
									key: "user.id",
									segments: ["user", "id"],
								},
								{
									type: EXPR_CALL,
									name: "url",
									args: [],
								},
							],
						},
					},
				],
			};

			const result = compile(ast);

			expect(result[0].expr).toEqual({
				type: EXPR_CALL,
				name: "url",
				args: [
					{
						type: EXPR_PATH,
						key: "user.id",
						segments: ["user", "id"],
					},
				],
			});
		});

		it("lowers multiple pipeline transforms", () => {
			const ast = {
				type: NODE_DIRECTIVE,
				bindings: [
					{
						type: NODE_BINDING,
						target: "text",
						expr: {
							type: EXPR_PIPELINE,
							steps: [
								{
									type: EXPR_PATH,
									key: "user.createdAt",
									segments: ["user", "createdAt"],
								},
								{
									type: EXPR_CALL,
									name: "formatDate",
									args: [
										{
											type: EXPR_LITERAL,
											value: "MMM DD",
										},
									],
								},
								{
									type: EXPR_CALL,
									name: "uppercase",
									args: [],
								},
							],
						},
					},
				],
			};

			const result = compile(ast);

			expect(result[0].expr).toEqual({
				type: EXPR_CALL,
				name: "uppercase",
				args: [
					{
						type: EXPR_CALL,
						name: "formatDate",
						args: [
							{
								type: EXPR_PATH,
								key: "user.createdAt",
								segments: ["user", "createdAt"],
							},
							{
								type: EXPR_LITERAL,
								value: "MMM DD",
							},
						],
					},
				],
			});
		});

		it("injects the previous result as the first argument", () => {
			const ast = {
				type: NODE_DIRECTIVE,
				bindings: [
					{
						type: NODE_BINDING,
						target: "text",
						expr: {
							type: EXPR_PIPELINE,
							steps: [
								{
									type: EXPR_PATH,
									key: "user.id",
									segments: ["user", "id"],
								},
								{
									type: EXPR_CALL,
									name: "format",
									args: [
										{
											type: EXPR_LITERAL,
											value: "hex",
										},
									],
								},
							],
						},
					},
				],
			};

			const result = compile(ast);

			expect(result[0].expr).toEqual({
				type: EXPR_CALL,
				name: "format",
				args: [
					{
						type: EXPR_PATH,
						key: "user.id",
						segments: ["user", "id"],
					},
					{
						type: EXPR_LITERAL,
						value: "hex",
					},
				],
			});
		});

		it("throws when pipeline is empty", () => {
			const ast = {
				type: NODE_DIRECTIVE,
				bindings: [
					{
						type: NODE_BINDING,
						target: "text",
						expr: {
							type: EXPR_PIPELINE,
							steps: [],
						},
					},
				],
			};

			expect(() => compile(ast)).toThrow(
				"Pipeline must contain at least one step",
			);
		});

		it("throws when a pipeline stage after the first step is not a function call", () => {
			const ast = {
				type: NODE_DIRECTIVE,
				bindings: [
					{
						type: NODE_BINDING,
						target: "text",
						expr: {
							type: EXPR_PIPELINE,
							steps: [
								{
									type: EXPR_PATH,
									key: "user.id",
									segments: ["user", "id"],
								},
								{
									type: EXPR_LITERAL,
									value: "hex",
								},
							],
						},
					},
				],
			};

			expect(() => compile(ast)).toThrow(
				"Expected function call or function path",
			);
		});
	});

	describe("errors", () => {
		it("throws for unknown binding node types", () => {
			expect(() =>
				compile({
					type: NODE_DIRECTIVE,
					bindings: [
						{
							type: 999999,
						},
					],
				}),
			).toThrow("Unknown node type");
		});

		it("throws for unknown expression types", () => {
			expect(() =>
				compile({
					type: NODE_DIRECTIVE,
					bindings: [
						{
							type: NODE_BINDING,
							target: "text",
							expr: {
								type: 999999,
							},
						},
					],
				}),
			).toThrow("Unsupported AST expression type");
		});
	});
});