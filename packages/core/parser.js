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

const EOF_TOKEN = [TOKEN_EOF, 0, 0];

/**
 * Extracts the source text represented by a token.
 *
 * Tokens use the tuple format [type, start, end], where
 * start is inclusive and end is exclusive.
 *
 * @example
 * // input = "user.name"
 * // token = [TOKEN_PATH, 0, 9]
 * slice(input, token)
 * // "user.name"
 *
 * @param {string} str Original input string.
 * @param {Array<number>} token Token tuple [type, start, end].
 * @returns {string} Source text represented by the token,
 *   or an empty string if the token is invalid.
 */
function slice(str, token) {
	if (!token || token.length < 3) return "";
	return str.slice(token[1], token[2]);
}

/**
 * Parses an event target with optional modifiers.
 *
 * Event targets use square brackets to enclose the event
 * name and dot-separated modifiers.
 *
 * @example
 * parseEventTarget("on[click.prevent.once]")
 * // {
 * //   event: "click",
 * //   modifiers: ["prevent", "once"]
 * // }
 *
 * @example
 * parseEventTarget("on[click]")
 * // { event: "click", modifiers: [] }
 *
 * @param {string} targetRaw Raw event target.
 * @returns {{event: string, modifiers: string[]}}
 *   Parsed event name and modifiers.
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
	const modifiers = [];

	for (let i = 1; i < length; i++) {
		const trimmed = rawParts[i].trim();

		if (trimmed) {
			modifiers.push(trimmed);
		}
	}

	return {
		event: rawParts[0].trim(),
		modifiers,
	};
}

/**
 * Ensures that an event handler expression is a valid
 * function call or pipeline.
 *
 * Bare top-level paths are converted into function calls.
 * Dotted paths, conditionals and literals are rejected.
 *
 * @example
 * // handleClick
 * ensureEventHandlerCall({
 *   type: EXPR_PATH,
 *   key: "handleClick",
 *   segments: ["handleClick"]
 * })
 * // { type: EXPR_CALL, name: "handleClick", args: [] }
 *
 * @example
 * // save:message
 * // An existing EXPR_CALL is returned unchanged.
 *
 * @param {Object} expr Event handler expression.
 * @returns {Object} Validated event handler expression.
 * @throws {Error} If the expression is empty or invalid.
 */
function ensureEventHandlerCall(expr) {
	if (!expr) {
		throw new Error("Event handler cannot be empty");
	}

	if (expr.type === EXPR_CALL || expr.type === EXPR_PIPELINE) {
		return expr;
	}

	if (expr.type === EXPR_CONDITIONAL) {
		throw new Error(
			`Invalid event handler. ` +
			`Conditional is not supported in @on directives.`
		);
	}

	if (expr.type === EXPR_PATH) {
		if (expr.segments && expr.segments.length > 1) {
			throw new Error(
				`Invalid event handler "${expr.key}". ` +
				`Dotted paths are not supported in @on directives. ` +
				`Only top-level functions are allowed.`
			);
		}

		return {
			type: EXPR_CALL,
			name: expr.key,
			args: [],
		};
	}

	// Reject literals and everything else
	throw new Error("Invalid event handler expression.");
}

/**
 * Udodi directive parser.
 *
 * Uses recursive descent to parse directive bindings
 * and their expressions.
 *
 * Expression precedence:
 * - Conditionals are parsed within primary expressions.
 * - Pipelines are parsed at the expression level.
 *
 * The parser consumes lexer tokens and produces a directive
 * AST suitable for compilation.
 */
class Parser {
	/**
	 * Creates a directive parser.
	 *
	 * @example
	 * const parser = new Parser(tokens, "text=user.name");
	 *
	 * @param {Array} tokens Tokens produced by the lexer.
	 * @param {string} input Original source string.
	 */
	constructor(tokens, input) {
		this.tokens = tokens || [];
		this.input = input || "";
		this.pos = 0;
		this.current = this.tokens[0] || EOF_TOKEN;
		this.currentType = this.current[0];
	}

	/**
	 * Advances to the next token.
	 *
	 * Updates the current token and its cached type.
	 * Once the token stream is exhausted, the shared EOF
	 * token is used.
	 *
	 * @example
	 * // Current token: TOKEN_PATH
	 * parser.advance();
	 * // Current token: next token or TOKEN_EOF
	 */
	advance() {
		this.pos++;

		this.current = this.tokens[this.pos] || EOF_TOKEN;
		this.currentType = this.current[0];
	}

	/**
	 * Returns the next token without consuming it.
	 *
	 * @example
	 * // Current token: TOKEN_PATH
	 * parser.peek();
	 * // The token immediately following the current token.
	 *
	 * @returns {Array} Next token, or the shared EOF token.
	 */
	peek() {
		return this.tokens[this.pos + 1] || EOF_TOKEN;
	}

	/**
	 * Consumes the current token if its type matches.
	 *
	 * @example
	 * // Current token: TOKEN_EQUAL
	 * parser.eat(TOKEN_EQUAL);
	 * // Returns the consumed token and advances the parser.
	 *
	 * @param {string} type Expected token type.
	 * @returns {Array} Consumed token.
	 * @throws {Error} If the current token does not match.
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
	 * Parses a literal or path expression.
	 *
	 * String, number and boolean tokens become literal nodes.
	 * Path tokens become path nodes containing the original
	 * key and its dot-separated segments.
	 *
	 * @example
	 * // user.name
	 * {
	 *   type: EXPR_PATH,
	 *   key: "user.name",
	 *   segments: ["user", "name"]
	 * }
	 *
	 * @example
	 * // 42
	 * { type: EXPR_LITERAL, value: 42 }
	 *
	 * @returns {Object} EXPR_LITERAL or EXPR_PATH node.
	 * @throws {Error} If the current token is not an atom.
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

		if (
			type === TOKEN_STRING ||
			type === TOKEN_NUMBER ||
			type === TOKEN_BOOLEAN
		) {
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
	 * Parses a function call using colon-separated arguments.
	 *
	 * The function name is a path token. Each colon introduces
	 * an atom argument.
	 *
	 * @example
	 * // increment:count
	 * {
	 *   type: EXPR_CALL,
	 *   name: "increment",
	 *   args: [
	 *     { type: EXPR_PATH, key: "count", segments: ["count"] }
	 *   ]
	 * }
	 *
	 * @example
	 * // formatDate:createdAt:'MMM DD'
	 *
	 * @returns {Object} EXPR_CALL node.
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
	 * Parses a primary expression.
	 *
	 * A primary expression can be an atom, a function call
	 * or a conditional expression. Conditional expressions
	 * are parsed recursively to preserve their associativity.
	 *
	 * @example
	 * // isValid => submit
	 * {
	 *   type: EXPR_CONDITIONAL,
	 *   condition: { type: EXPR_PATH, ... },
	 *   value: { type: EXPR_PATH, ... }
	 * }
	 *
	 * @returns {Object} Parsed expression AST node.
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

		if (this.currentType === TOKEN_ARROW) {
			this.advance();
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
	 * Parses an expression, optionally containing a pipeline.
	 *
	 * Parses the initial primary expression first. A pipeline
	 * array is allocated only when a pipe token is encountered,
	 * avoiding an unnecessary array allocation for ordinary
	 * expressions.
	 *
	 * @example
	 * // user.name
	 * // Returns an EXPR_PATH directly, without a steps array.
	 *
	 * @example
	 * // user.id | url | encode
	 * {
	 *   type: EXPR_PIPELINE,
	 *   steps: [/* parsed primary expressions *\/]
	 * }
	 *
	 * @returns {Object} Expression AST node, possibly an EXPR_PIPELINE.
	 */
	parseExpression() {
		let expr = this.parsePrimary();

		if (this.currentType !== TOKEN_PIPE) {
			return expr;
		}

		const steps = [expr];

		do {
			this.advance();
			steps.push(this.parsePrimary());
		} while (this.currentType === TOKEN_PIPE);

		return { type: EXPR_PIPELINE, steps };
	}

	/**
	 * Parses a single directive binding.
	 *
	 * Supports ordinary target bindings and event bindings.
	 * Event targets are parsed for their event name and
	 * modifiers, and their expressions are validated.
	 *
	 * @example
	 * // text=user.name
	 * {
	 *   type: NODE_BINDING,
	 *   target: "text",
	 *   expr: { type: EXPR_PATH, ... }
	 * }
	 *
	 * @example
	 * // on[click.prevent]=handleClick
	 * {
	 *   type: NODE_EVENT_BINDING,
	 *   target: "on",
	 *   event: "click",
	 *   modifiers: ["prevent"],
	 *   expr: { type: EXPR_CALL, ... }
	 * }
	 *
	 * @returns {Object} NODE_BINDING or NODE_EVENT_BINDING.
	 * @throws {Error} If the binding cannot be parsed.
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
	 * Parses the entire directive into an AST.
	 *
	 * Repeatedly parses bindings until the end of the token stream.
	 * Any parsing error is propagated to the caller.
	 *
	 * @example
	 * // text=user.name disabled=isDisabled
	 * {
	 *   type: NODE_DIRECTIVE,
	 *   bindings: [
	 *     { type: NODE_BINDING, ... },
	 *     { type: NODE_BINDING, ... }
	 *   ]
	 * }
	 *
	 * @returns {Object} NODE_DIRECTIVE AST node.
	 */
	parseDirective() {
		const bindings = [];

		while (this.currentType !== TOKEN_EOF) {
			if (this.currentType === TOKEN_PATH) {
				bindings.push(this.parseBinding());
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
 * Parses a tokenized directive into an AST.
 *
 * Creates a parser and delegates parsing to its main
 * entry point. An empty or missing token array produces
 * an empty directive AST.
 *
 * @example
 * const ast = parseDirective(tokens, "text=user.name");
 *
 * @param {Array} tokens Tokens produced by the lexer.
 * @param {string} input Original directive source string.
 * @returns {Object} NODE_DIRECTIVE AST node.
 */
export function parseDirective(tokens, input) {
	if (!tokens || tokens.length === 0) {
		return { type: NODE_DIRECTIVE, bindings: [] };
	}

	const parser = new Parser(tokens, input);
	return parser.parseDirective();
}
