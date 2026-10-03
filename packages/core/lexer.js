
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

/**
 * Checks whether a substring represents a boolean literal.
 *
 * Recognizes only the lowercase literals `true` and `false`.
 * Uses character codes to avoid creating temporary substrings.
 *
 * @example
 * isBooleanLiteral("true", 0, 4)
 * // true
 *
 * @example
 * isBooleanLiteral("false", 0, 5)
 * // true
 *
 * @example
 * isBooleanLiteral("True", 0, 4)
 * // false
 *
 * @param {string} str Original input string.
 * @param {number} start Start index (inclusive).
 * @param {number} end End index (exclusive).
 * @returns {boolean} Whether the substring is a boolean literal.
 */
function isBooleanLiteral(str, start, end) {
	const len = end - start;

	if (len === 4) {
		return (
			str.charCodeAt(start) === 116 &&
			str.charCodeAt(start + 1) === 114 &&
			str.charCodeAt(start + 2) === 117 &&
			str.charCodeAt(start + 3) === 101
		);
	}

	if (len === 5) {
		return (
			str.charCodeAt(start) === 102 &&
			str.charCodeAt(start + 1) === 97 &&
			str.charCodeAt(start + 2) === 108 &&
			str.charCodeAt(start + 3) === 115 &&
			str.charCodeAt(start + 4) === 101
		);
	}

	return false;
}

/**
 * Checks whether a substring represents a valid number literal.
 *
 * Supports:
 * - Integers: `123`, `-456`
 * - Decimals: `123.45`, `-0.5`, `3.14159`
 *
 * Does not support:
 * - Scientific notation
 * - Hexadecimal notation
 * - Leading decimal points (`.5`, `-.5`)
 * - Trailing decimal points (`5.`)
 * - Multiple decimal points (`1.2.3`)
 * - A standalone negative sign (`-`)
 *
 * A negative sign is permitted only at the beginning, and
 * a decimal point must have at least one digit on each side.
 *
 * @example
 * isNumberLiteral("123", 0, 3)
 * // true
 *
 * @example
 * isNumberLiteral("-0.5", 0, 4)
 * // true
 *
 * @example
 * isNumberLiteral("-.5", 0, 3)
 * // false
 *
 * @param {string} str Original input string.
 * @param {number} start Start index (inclusive).
 * @param {number} end End index (exclusive).
 * @returns {boolean} Whether the substring is a valid number.
 */
function isNumberLiteral(str, start, end) {
	if (start >= end) return false;

	let i = start;
	let dotSeen = false;

	// Allow a leading negative sign.
	if (str.charCodeAt(i) === 45) {
		i++;

		// Reject a standalone negative sign.
		if (i === end) return false;
	}

	// A decimal point must have a digit before it.
	if (str.charCodeAt(i) === 46) return false;

	for (; i < end; i++) {
		const c = str.charCodeAt(i);

		if (c === 46) {
			if (dotSeen || i === end - 1) return false;

			dotSeen = true;
			continue;
		}

		if (c < 48 || c > 57) return false;
	}

	return true;
}

/**
 * Emits a token after classifying its source substring.
 *
 * Classifies the substring as a boolean, number or path.
 * Empty substrings are ignored.
 *
 * @example
 * // "true" produces [TOKEN_BOOLEAN, 0, 4]
 * emitToken(tokens, "true", 0, 4);
 *
 * @example
 * // "123" produces [TOKEN_NUMBER, 0, 3]
 * emitToken(tokens, "123", 0, 3);
 *
 * @param {Array<[number, number, number]>} tokens Token array.
 * @param {string} str Original input string.
 * @param {number} start Start index (inclusive).
 * @param {number} end End index (exclusive).
 * @returns {void}
 */
function emitToken(tokens, str, start, end) {
	if (start >= end) return;

	let type = TOKEN_PATH;

	if (isBooleanLiteral(str, start, end)) {
		type = TOKEN_BOOLEAN;
	} else if (isNumberLiteral(str, start, end)) {
		type = TOKEN_NUMBER;
	}

	tokens.push([type, start, end]);
}

/**
 * Udodi directive lexer (tokenizer).
 *
 * Converts a directive source string into a flat list of
 * tokens for the parser.
 *
 * Uses a single-pass character scanner to recognize paths,
 * literals, operators and quoted strings.
 *
 * Token format:
 * [TOKEN_TYPE, startIndex, endIndex]
 *
 * Supported tokens include:
 * - Paths
 * - Quoted strings (single and double quotes)
 * - Numbers and booleans
 * - Colons and pipes
 * - Equality operators
 * - Conditional arrows (`=>`)
 * - End of input (EOF)
 *
 * Whitespace outside quoted strings separates tokens.
 * Backslash escapes are recognized inside quoted strings.
 *
 * @example
 * lexDirective("format:'dd MMM'")
 * // Returns tokens for the function path, colon,
 * // quoted string and EOF.
 *
 * @example
 * lexDirective("count=-12.5")
 * // Returns tokens for the path, equal sign,
 * // number and EOF.
 *
 * @param {string} str Directive source to tokenize.
 * @returns {Array<[number, number, number]>}
 *   Token array ending with EOF.
 * @throws {Error} If a quoted string is not closed.
 */
export function lexDirective(str) {
	if (typeof str !== "string" || str.length === 0) {
		return [[TOKEN_EOF, 0, 0]];
	}

	const tokens = [];
	const len = str.length;

	let quote = 0;
	let escaped = false;
	let start = -1;

	for (let i = 0; i < len; i++) {
		const c = str.charCodeAt(i);

		// Handle escapes inside quoted strings.
		if (quote !== 0 && c === 92 && !escaped) {
			escaped = true;
			continue;
		}

		// Handle opening and closing quotes.
		if ((c === 34 || c === 39) && !escaped) {
			if (quote === 0) {
				if (start !== -1) {
					emitToken(tokens, str, start, i);
				}

				quote = c;
				start = i;
				
			} else if (quote === c) {
				tokens.push([TOKEN_STRING, start, i + 1]);
				quote = 0;
				start = -1;
			}

			escaped = false;
			continue;
		}

		escaped = false;

		// Whitespace outside quoted strings.
		if (quote === 0 && c <= 32) {
			if (start !== -1) {
				emitToken(tokens, str, start, i);
				start = -1;
			}

			continue;
		}

		// Pipe: |
		if (quote === 0 && c === 124) {
			if (start !== -1) {
				emitToken(tokens, str, start, i);
			}

			tokens.push([TOKEN_PIPE, i, i + 1]);
			start = -1;

			continue;
		}

		// Colon: :
		if (quote === 0 && c === 58) {
			if (start !== -1) {
				emitToken(tokens, str, start, i);
			}

			tokens.push([TOKEN_COLON, i, i + 1]);
			start = -1;

			continue;
		}

		// Conditional arrow: =>
		if (
			quote === 0 &&
			c === 61 &&
			i + 1 < len &&
			str.charCodeAt(i + 1) === 62
		) {
			if (start !== -1) {
				emitToken(tokens, str, start, i);
			}

			tokens.push([TOKEN_ARROW, i, i + 2]);
			start = -1;
			i++;

			continue;
		}

		// Equality: =
		if (quote === 0 && c === 61) {
			if (start !== -1) {
				emitToken(tokens, str, start, i);
			}

			tokens.push([TOKEN_EQUAL, i, i + 1]);
			start = -1;

			continue;
		}

		// Start of a new token.
		if (start === -1) {
			start = i;
		}
	}

	// Reject unclosed quoted strings.
	if (quote !== 0) {
		throw new Error(
			`Unclosed quoted string starting at index ${start}: ${str}`
		);
	}

	// Emit the final token, if present.
	if (start !== -1) {
		emitToken(tokens, str, start, len);
	}

	tokens.push([TOKEN_EOF, len, len]);

	return tokens;
}
