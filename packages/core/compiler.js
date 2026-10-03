import {
	OP_EVAL,
	OP_SET,
	OP_EVENT_BIND,
} from "./opcodes.js";

import {
	EXPR_LITERAL,
	EXPR_PATH,
	EXPR_CALL,
	EXPR_CONDITIONAL,
	EXPR_PIPELINE,
	NODE_BINDING,
	NODE_EVENT_BINDING,
} from "./expTypes.js";

import { compileModifiers } from "./modifiers.js";

/**
 * Compiles a parsed directive AST into VM instructions.
 *
 * Compilation performs AST → IR lowering, converting parsed
 * expressions into the representation consumed by the VM.
 *
 * Each binding produces an evaluation instruction followed
 * by a target assignment instruction. Event bindings produce
 * a single event instruction.
 *
 * @example
 * user.name
 * becomes:
 * [
 *   { op: OP_EVAL, expr: { type: EXPR_PATH, ... } },
 *   { op: OP_SET, target: ... }
 * ]
 *
 * @param {Object} ast Root AST node containing directive bindings.
 * @returns {Array<Object>} Compiled VM instructions.
 */
export function compile(ast) {
	const instructions = [];
	const bindings = ast.bindings;
	const length = bindings.length;

	for (let i = 0; i < length; i++) {
		const node = bindings[i];

		switch (node.type) {
			case NODE_BINDING: {
				instructions.push(
					{ op: OP_EVAL, expr: lowerExpr(node.expr) },
					{ op: OP_SET, target: node.target }
				);

				break;
			}

			case NODE_EVENT_BINDING:
				instructions.push({
					op: OP_EVENT_BIND,
					event: node.event,
					modifiers: compileModifiers(node.modifiers),
					expr: lowerExpr(node.expr),
				});

				break;

			default:
				throw new Error(`Unknown node type: ${node.type}`);
		}
	}

	return instructions;
}

/**
 * Lowers an expression AST node into its VM representation.
 *
 * Literal and path expressions are copied into the VM
 * representation. Composite expressions recursively lower
 * their child expressions.
 *
 * Pipeline expressions are converted into nested function
 * calls before being returned.
 * 
 * Supported expression types:
 *
 * - EXPR_LITERAL
 * - EXPR_PATH
 * - EXPR_CALL
 * - EXPR_CONDITIONAL
 * - EXPR_PIPELINE
 *
 * @example
 * user.name
 * becomes:
 * { type: EXPR_PATH, key: "user", segments: ["name"] }
 *
 * @example
 * user.id | url | encode
 * becomes:
 * encode(url(user.id))
 *
 * @param {Object} node Expression AST node.
 * @returns {Object} Lowered expression.
 * @throws {Error} If the expression is missing or unsupported.
 */
function lowerExpr(node) {
	if (!node) {
		throw new Error("Expected expression node");
	}

	switch (node.type) {
		case EXPR_LITERAL:
			return { type: EXPR_LITERAL, value: node.value };

		case EXPR_PATH:
			return {
				type: EXPR_PATH,
				key: node.key,
				segments: node.segments || [],
			};

		case EXPR_CALL: {
			const args = node.args;
			const length = args.length;
			const loweredArgs = new Array(length);

			for (let i = 0; i < length; i++) {
				loweredArgs[i] = lowerExpr(args[i]);
			}

			return {
				type: EXPR_CALL,
				name: node.name,
				args: loweredArgs,
			};
		}

		case EXPR_CONDITIONAL:
			return {
				type: EXPR_CONDITIONAL,
				condition: lowerExpr(node.condition),
				value: lowerExpr(node.value),
			};

		case EXPR_PIPELINE:
			return lowerPipeline(node.steps);

		default:
			throw new Error(`Unsupported AST expression type: ${node.type}`);
	}
}

/**
 * Lowers a pipeline expression into nested function calls.
 *
 * The first pipeline step becomes the initial expression.
 * Each subsequent step wraps the current expression in a
 * function call, passing the current expression as its
 * first argument, followed by any explicit arguments.
 *
 * Only top-level function paths are allowed as pipeline
 * steps. Function calls are also supported.
 *
 * @example
 * user.id | url | encode
 * becomes:
 * encode(url(user.id))
 *
 * @example
 * user.id | formatDate:'MMM DD' | uppercase
 * becomes:
 * uppercase(formatDate(user.id, 'MMM DD'))
 *
 * @param {Array<Object>} steps Ordered pipeline expression nodes.
 * @returns {Object} Nested function-call expression.
 * @throws {Error} If the pipeline is empty or contains an invalid step.
 */
function lowerPipeline(steps) {
	if (!Array.isArray(steps) || steps.length === 0) {
		throw new Error("Pipeline must contain at least one step");
	}

	let expr = lowerExpr(steps[0]);
	const stepsLength = steps.length;

	for (let i = 1; i < stepsLength; i++) {
		const step = lowerExpr(steps[i]);

		let stepName;
		let stepArgs;

		if (step.type === EXPR_CALL) {
			stepName = step.name;
			stepArgs = step.args || [];

		} else if (step.type === EXPR_PATH) {
			if (step.segments.length > 1) {
				throw new Error(
					`Invalid pipeline step at index ${i}: ` +
					`only top-level functions are allowed in pipelines`
				);
			}

			stepName = step.segments[0];
			stepArgs = [];

		} else {
			throw new Error(
				`Invalid pipeline step at index ${i}. ` +
				`Expected function call or function path.`
			);
		}

		// The piped value becomes the first argument of the function call.
		const length = stepArgs.length;
		const args = new Array(length + 1);

		// Place the piped expression as the first argument of the function call
		args[0] = expr;

		// Append all original call args after the first one (which is now the piped value)
		for (let j = 0; j < length; j++) {
			args[j + 1] = stepArgs[j];
		}

		expr = {
			type: EXPR_CALL,
			name: stepName,
			args,
		};
	}

	return expr;
}
