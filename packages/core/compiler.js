import {
	OP_EVAL,
	OP_SET,
	OP_EVENT_BIND
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
 * Compilation performs AST → IR lowering.
 *
 * Pipeline expressions are transformed into nested function calls:
 *
 * @example
 * user.id | url | encode
 *
 * becomes:
 *
 * encode(url(user.id))
 *
 * @param {Object} ast Root AST node.
 * @returns {Array<Object>} VM instructions.
 */
export function compile(ast) {
	const instructions = [];
	const bindings = ast.bindings;
	const length = bindings.length;

	for (let i = 0; i < length; i++) {
		const node = bindings[i];

		switch (node.type) {
			case NODE_BINDING:
				compileBinding(node, instructions);
				break;

			case NODE_EVENT_BINDING:
				compileEventBinding(node, instructions);
				break;

			default:
				throw new Error(`Unknown node type: ${node.type}`);
		}
	}

	return instructions;
}

/**
 * Compiles a regular binding.
 *
 * Generates:
 *
 * OP_EVAL
 * OP_SET
 *
 * @param {Object} node Binding node.
 * @param {Array<Object>} out Output instruction array.
 */
function compileBinding(node, out) {
	out.push({
		op: OP_EVAL,
		expr: lowerExpr(node.expr),
	});

	out.push({
		op: OP_SET,
		target: node.target,
	});
}

/**
 * Compiles an event binding.
 *
 * Generates:
 *
 * OP_EVENT_BIND
 *
 * @param {Object} node Event binding node.
 * @param {Array<Object>} out Output instruction array.
 */
function compileEventBinding(node, out) {
	out.push({
		op: OP_EVENT_BIND,
		event: node.event,
		modifiers: compileModifiers(node.modifiers),
		expr: lowerExpr(node.expr),
	});
}

/**
 * Lowers an AST expression into VM IR.
 *
 * Supported expression types:
 *
 * - EXPR_LITERAL
 * - EXPR_PATH
 * - EXPR_CALL
 * - EXPR_CONDITIONAL
 * - EXPR_PIPELINE
 *
 * @param {Object} node AST expression node.
 * @returns {Object} Lowered VM IR node.
 */
function lowerExpr(node) {
	if (!node) {
		throw new Error("Expected expression node");
	}

	switch (node.type) {
		case EXPR_LITERAL:
			return {
				type: EXPR_LITERAL,
				value: node.value,
			};

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
			throw new Error(
				`Unsupported AST expression type: ${node.type}`,
			);
	}
}

/**
 * Lowers a pipeline expression into nested function calls.
 *
 * Pipelines are transformed from left-to-right into right-associated nested calls,
 * with each step's result becoming the first argument of the next function.
 *
 * @example
 * ```js
 * user.id | url | encode
 * ```
 * becomes:
 * ```js
 * encode(url(user.id))
 * ```
 *
 * @example
 * ```js
 * user.id | formatDate:'MMM DD' | uppercase
 * ```
 * becomes:
 * ```js
 * uppercase(formatDate(user.id, 'MMM DD'))
 * ```
 *
 * **Rules:**
 * - The first step may be any expression.
 * - Every subsequent step must be a function call (or a path that resolves to one).
 *
 * @param {Array<Object>} steps - Pipeline AST steps.
 * @param {Object} steps[0] - The initial expression (can be any valid expression type).
 * @param {Object} steps[i] - Subsequent steps, expected to lower to either `EXPR_CALL` or `EXPR_PATH`.
 * @returns {Object} Lowered VM IR expression (nested `EXPR_CALL` nodes).
 * @throws {Error} If the pipeline is empty or contains invalid steps after the first.
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

		// Resolve callable step name and arguments
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
