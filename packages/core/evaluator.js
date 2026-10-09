import {
	EXPR_LITERAL,
	EXPR_PATH,
	EXPR_CALL,
	EXPR_CONDITIONAL,
} from "./expTypes.js";

import { resolveContextValue } from "../runtime/context.js";

/**
 * Pure expression evaluator for Udodi.
 *
 * Evaluates the lowered IR produced by compiler.js.
 * Pipelines are already transformed into nested function calls.
 *
 * Context must always be supplied by the caller.
 *
 * @param {Object} expr - Compiled expression IR.
 * @param {Object|null} [context=null] - Evaluation context.
 * @param {Object} [event] - Event injected into function calls.
 * @returns {*} Evaluated value.
 */
export function evaluate(expr, context = null, event) {
	if (expr == null) return undefined;

	switch (expr.type) {
		case EXPR_LITERAL:
			return expr.value;

		case EXPR_PATH:
			return evaluatePath(expr.segments, context);

		case EXPR_CALL:
			return evaluateCall(expr, context, evaluate, event);

		case EXPR_CONDITIONAL:
			return evaluateConditional(expr, context, evaluate);

		default:
			throw new Error(`Unknown expression type: ${expr.type}`);
	}
}

/**
 * Evaluates a compiled path expression.
 *
 * Automatically invokes functions encountered during traversal,
 * allowing reactive signal getters to be transparently unwrapped.
 *
 * @param {string[]} segments - Ordered path segments.
 * @param {Object|null} context - Current lexical scope.
 * @returns {*}
 */
function evaluatePath(segments, context) {
	const length = segments.length;

	if (length === 0) return undefined;

	let value = resolveContextValue(context, segments[0]);

	if (typeof value === "function") {
		value = value();
	}

	for (let i = 1; i < length && value != null; i++) {
		value = value[segments[i]];

		if (typeof value === "function") {
			value = value();
		}
	}

	return value;
}

/**
 * Evaluates a compiled function call.
 *
 * Pipelines are lowered into nested calls by the compiler.
 * Calls with up to three arguments avoid array allocation.
 *
 * @param {Object} expr - Compiled call expression.
 * @param {Object|null} context - Current lexical scope.
 * @param {Function} evaluate - Recursive expression evaluator.
 * @param {Object} [event] - Optional event object.
 * @returns {*}
 */
function evaluateCall(expr, context, evaluate, event) {
	const fn = resolveContextValue(context, expr.name);

	if (typeof fn !== "function") {
		throw new Error(`Unknown function: ${expr.name}`);
	}

	const args = expr.args;
	const length = args.length;
	const hasEvent = event !== undefined;

	switch (length) {
		case 0:
			return hasEvent ? fn(event) : fn();

		case 1: {
			const a = evaluate(args[0], context);
			return hasEvent ? fn(event, a) : fn(a);
		}

		case 2: {
			const a = evaluate(args[0], context);
			const b = evaluate(args[1], context);

			return hasEvent ? fn(event, a, b) : fn(a, b);
		}

		case 3: {
			const a = evaluate(args[0], context);
			const b = evaluate(args[1], context);
			const c = evaluate(args[2], context);

			return hasEvent ? fn(event, a, b, c) : fn(a, b, c);
		}

		default: {
			const offset = hasEvent ? 1 : 0;
			const evaluated = new Array(length + offset);

			if (hasEvent) {
				evaluated[0] = event;
			}

			for (let i = 0; i < length; i++) {
				evaluated[i + offset] = evaluate(args[i], context);
			}

			return fn(...evaluated);
		}
	}
}

/**
 * Evaluates a conditional expression: condition => value.
 *
 * The value expression is evaluated only when the condition
 * resolves to true.
 *
 * @param {Object} expr - Conditional expression.
 * @param {Object|null} context - Current lexical scope.
 * @param {Function} evaluate - Recursive expression evaluator.
 * @returns {*} Evaluated value or undefined.
 * @throws {Error} If the condition is not boolean.
 */
function evaluateConditional(expr, context, evaluate) {
	const condition = evaluate(expr.condition, context);

	if (typeof condition !== "boolean") {
		throw new Error(
			`Conditional expression must resolve to boolean, got ${typeof condition}`
		);
	}

	return condition ? evaluate(expr.value, context) : undefined;
}
