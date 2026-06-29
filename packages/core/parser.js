import {
	TOKEN_PATH,
	TOKEN_STRING,
	TOKEN_NUMBER,
	TOKEN_BOOLEAN,
	TOKEN_COLON,
	TOKEN_PIPE,
	TOKEN_EOF,
	TOKEN_EQUAL,
	TOKEN_ARROW,
} from "./tokens.js";

import {
	EXPR_LITERAL,
	EXPR_PATH,
	EXPR_CALL,
	EXPR_CONDITIONAL,
	EXPR_PIPELINE,
	NODE_DIRECTIVE,
	NODE_BINDING,
	NODE_EVENT_BINDING,
} from "./expTypes.js";

/**
 * Safe string slice helper using token position.
 *
 * @param {string} str - Original input string
 * @param {Array<number>} token - Token tuple [type, start, end]
 * @returns {string}
 */
function slice(str, token) {
	if (!token || token.length < 3) return "";
	return str.slice(token[1], token[2]);
}

/**
 * Parses an event target with optional modifiers.
 *
 * Example: `on[click.prevent.once]`
 *
 * @param {string} targetRaw - Raw target like "on[click.prevent.once]"
 * @returns {{event: string, modifiers: string[]}}
 */
function parseEventTarget(targetRaw) {
	const start = targetRaw.indexOf("[");
	const end = targetRaw.indexOf("]");

	if (start === -1 || end === -1 || end <= start) {
		return { event: targetRaw, modifiers: [] };
	}

	const inside = targetRaw.slice(start + 1, end).trim();
	if (!inside) {
		return { event: targetRaw, modifiers: [] };
	}

	const rawParts = inside.split(".");
	const length = rawParts.length;

	// Note: Compiler can handle undefined modifiers, 
	// so we don't need to filter them out here.
	const modifiers = new Array(length - 1);

	for (let i = 1; i < length; i++) {
		const trimmed = rawParts[i].trim();
		if (trimmed) {
			modifiers[i - 1] = trimmed;
		}
	}

	return {
		event: rawParts[0].trim(),
		modifiers,
	};
}

/**
 * Ensures that event handler expressions are valid.
 *
 * Allowed:
 *   - Bare path: `handleClick` --> becomes `handleClick()`
 *   - Function call: `save:message`
 *   - Pipeline: `validate | save`
 *
 * Not allowed:
 *   - Dotted paths (`user.save`)
 *   - Literals (`'foo'`, `42`)
 *   - Conditional: `isValid => save`
 */
function ensureEventHandlerCall(expr) {
	if (!expr) {
		throw new Error("Event handler cannot be empty");
	}

	// Already a call or pipeline
	if (expr.type === EXPR_CALL || expr.type === EXPR_PIPELINE) {
		return expr;
	}

	// Conditionals not allowed
	if (expr.type === EXPR_CONDITIONAL) {
		throw new Error(
			`Invalid event handler. ` +
			`Conditional is not supported in @on directives.`
		);
	}

	// Only top-level simple paths are allowed (no dots)
	if (expr.type === EXPR_PATH) {
		if (expr.segments && expr.segments.length > 1) {
			throw new Error(
				`Invalid event handler "${expr.key}". ` +
				`Dotted paths are not supported in @on directives. ` +
				`Only top-level functions are allowed.`
			);
		}

		// Convert bare path to function call
		return {
			type: EXPR_CALL,
			name: expr.key,
			args: [],
		};
	}

	// Reject literals and everything else
	throw new Error('Invalid event handler expression.');
}

/**
 * Udodi Directive Parser - Optimized
 *
 * Performance optimizations applied:
 * - Cached `currentType` to avoid getter overhead
 * - Reduced method calls in hot paths
 * - Manual loop in `parseEventTarget` (no .map())
 * - Minimal object allocations
 *
 * This is a recursive descent parser with correct precedence:
 * - Conditionals (`=>`) > Pipelines (`|`)
 */
class Parser {
	/**
	 * @param {Array} tokens - Array of tokens from lexer
	 * @param {string} input - Original source string (used for slicing values)
	 */
	constructor(tokens, input) {
		this.tokens = tokens || [];
		this.input = input || "";
		this.pos = 0;
		this.current = this.tokens[0] || [TOKEN_EOF, 0, 0];
		this.currentType = this.current[0]; // Cached for performance
	}

	/**
	 * Advance to the next token and update cached type.
	 */
	advance() {
		this.pos++;
		this.current = this.tokens[this.pos] || [TOKEN_EOF, 0, 0];
		this.currentType = this.current[0];
	}

	/**
	 * Peek at the next token without consuming it.
	 * @returns {Array} Next token
	 */
	peek() {
		return this.tokens[this.pos + 1] || [TOKEN_EOF, 0, 0];
	}

	/**
	 * Consume current token if it matches expected type.
	 *
	 * @param {string} type - Expected token type
	 * @returns {Array} Consumed token
	 * @throws {Error} On mismatch
	 */
	eat(type) {
		if (this.currentType !== type) {
			throw new Error(
				`Parse error: Expected ${type}, got ${this.currentType} at position ${this.pos}`,
			);
		}
		const token = this.current;
		this.advance();
		return token;
	}

	/**
	 * Parse literal or path (lowest level).
	 *
	 * @returns {Object} EXPR_LITERAL or EXPR_PATH node
	 */
	parseAtom() {
		const token = this.current;
		const type = this.currentType;

		if (type === TOKEN_PATH) {
			const value = slice(this.input, this.eat(TOKEN_PATH));
			return {
				type: EXPR_PATH,
				segments: value.split("."),
				key: value,
			};
		}

		if (type === TOKEN_STRING || type === TOKEN_NUMBER || type === TOKEN_BOOLEAN) {
			const raw = slice(this.input, token);
			this.advance();

			let value;

			if (type === TOKEN_STRING) {
				value = raw.slice(1, -1);
			} else if (type === TOKEN_NUMBER) {
				value = Number(raw);
			} else {
				value = raw === "true";
			}

			return { type: EXPR_LITERAL, value };
		}

		throw new Error(`Unexpected token in atom: ${type}`);
	}

	/**
	 * Parse function call using colon syntax.
	 *
	 * Examples:
	 * - `increment:count`
	 * - `formatDate:createdAt:'MMM DD'`
	 * - `add:a:b`
	 *
	 * @returns {Object} EXPR_CALL node
	 */
	parseCall() {
		const name = slice(this.input, this.eat(TOKEN_PATH));
		const args = [];

		while (this.currentType === TOKEN_COLON) {
			this.advance();
			args.push(this.parseAtom());
		}

		return { type: EXPR_CALL, name, args };
	}

	/**
	 * Parse primary expression: atom, call, or conditional.
	 *
	 * @returns {Object} Expression AST node
	 */
	parsePrimary() {
		let expr;

		if (this.currentType === TOKEN_PATH) {
			if (this.peek()[0] === TOKEN_COLON) {
				expr = this.parseCall();
			} else {
				expr = this.parseAtom();
			}
		} else {
			expr = this.parseAtom();
		}

		// Conditional has higher precedence than pipeline
		if (this.currentType === TOKEN_ARROW) {
			this.advance(); // consume =>
			const value = this.parsePrimary();

			return {
				type: EXPR_CONDITIONAL,
				condition: expr,
				value,
			};
		}

		return expr;
	}

	/**
	 * Parse full expression including pipelines (lowest precedence).
	 *
	 * @returns {Object} Expression node (may be EXPR_PIPELINE)
	 */
	parseExpression() {
		const steps = [this.parsePrimary()];

		while (this.currentType === TOKEN_PIPE) {
			this.advance();
			steps.push(this.parsePrimary());
		}

		return steps.length === 1 ? steps[0] : { type: EXPR_PIPELINE, steps };
	}

	/**
	 * Parse a single binding: `target=expression` or `on[event.modifier]=expression`
	 *
	 * @returns {Object} NODE_BINDING or NODE_EVENT_BINDING
	 */
	parseBinding() {
		const targetToken = this.eat(TOKEN_PATH);
		const rawTarget = slice(this.input, targetToken);

		this.eat(TOKEN_EQUAL);

		const expr = this.parseExpression();

		if (rawTarget.startsWith("on[")) {
			const { event, modifiers } = parseEventTarget(rawTarget);
			return {
				type: NODE_EVENT_BINDING,
				target: "on",
				event,
				modifiers,
				expr: ensureEventHandlerCall(expr),
			};
		}

		return {
			type: NODE_BINDING,
			target: rawTarget,
			expr,
		};
	}

	/**
	 * Main entry point: Parse entire directive with multiple bindings.
	 *
	 * @returns {Object} NODE_DIRECTIVE AST
	 */
	parseDirective() {
		const bindings = [];

		while (this.currentType !== TOKEN_EOF) {
			if (this.currentType === TOKEN_PATH) {
				try {
					bindings.push(this.parseBinding());
				} catch (err) {
					console.error("[Udodi Parser] Error parsing binding:", err.message);
					this.advance(); // Recovery
				}
			} else {
				this.advance();
			}
		}

		return {
			type: NODE_DIRECTIVE,
			bindings,
		};
	}
}

/**
 * Main parsing function.
 *
 * @param {Array} tokens - Tokens from lexer
 * @param {string} input - Original source string
 * @returns {Object} Parsed directive AST
 */
export function parseDirective(tokens, input) {
	if (!tokens || tokens.length === 0) {
		return { type: NODE_DIRECTIVE, bindings: [] };
	}
	const parser = new Parser(tokens, input);
	return parser.parseDirective();
}
