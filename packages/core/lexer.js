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
 * Checks if a substring represents a boolean literal (`true` or `false`).
 *
 * @param {string} str - Original input string
 * @param {number} start - Start index (inclusive)
 * @param {number} end - End index (exclusive)
 * @returns {boolean}
 */
function isBooleanLiteral(str, start, end) {
	const len = end - start;
	if (len === 4) {
		return str.slice(start, end) === "true";
	}
	if (len === 5) {
		return str.slice(start, end) === "false";
	}
	return false;
}

/**
 * Checks if a substring is a valid number literal.
 *
 * Supports:
 * - Integers: `123`, `-456`
 * - Decimals: `123.45`, `-0.5`, `3.14159`
 *
 * Does NOT support: scientific notation, hex, leading dots, etc.
 *
 * @param {string} str - Original input string
 * @param {number} start - Start index (inclusive)
 * @param {number} end - End index (exclusive)
 * @returns {boolean}
 */
function isNumberLiteral(str, start, end) {
	if (start >= end) return false;

	let i = start;
	let dotSeen = false;

	// Allow leading negative sign
	if (str.charCodeAt(i) === 45) { // '-'
		i++;
		if (i === end) return false; // lone '-'
	}

	for (; i < end; i++) {
		const c = str.charCodeAt(i);

		if (c === 46) { // '.'
			if (dotSeen) return false;
			if (i === start || i === end - 1) return false; // '.5' or '5.' invalid
			dotSeen = true;
			continue;
		}

		if (c < 48 || c > 57) return false; // not a digit
	}

	return true;
}

/**
 * Emits a token after classifying it as PATH, NUMBER, or BOOLEAN.
 *
 * @param {Array<[number, number, number]>} tokens - Token array
 * @param {string} str - Original input
 * @param {number} start - Start index
 * @param {number} end - End index (exclusive)
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
 * Udodi Directive Lexer (Tokenizer)
 *
 * Converts a directive string into a flat list of tokens for the parser.
 * Designed for speed and simplicity.
 *
 * Token format: `[TOKEN_TYPE, startIndex, endIndex]`
 *
 * @param {string} str - The directive source to tokenize
 * @returns {Array<[number, number, number]>} Array of tokens ending with EOF
 *
 * @example
 * lexDirective("format:'dd MMM'")
 * // Returns tokens for paths, operators, literals, etc.
 */
export function lexDirective(str) {
	if (typeof str !== "string" || str.trim() === "") {
		return [[TOKEN_EOF, 0, 0]];
	}

	const tokens = [];
	const len = str.length;

	let quote = 0;        // 0 = none, 34 = ", 39 = '
	let escaped = false;
	let start = -1;

	for (let i = 0; i < len; i++) {
		const c = str.charCodeAt(i);

		// Handle escapes inside strings
		if (quote !== 0 && c === 92 && !escaped) { // backslash
			escaped = true;
			continue;
		}

		// Quote handling
		if ((c === 34 || c === 39) && !escaped) { // " or '
			if (quote === 0) {
				// Start of string
				if (start !== -1) emitToken(tokens, str, start, i);
				quote = c;
				start = i;
			} else if (quote === c) {
				// End of string
				tokens.push([TOKEN_STRING, start, i + 1]);
				quote = 0;
				start = -1;
			}
			escaped = false;
			continue;
		}

		escaped = false;

		// Whitespace handling (outside strings)
		if (quote === 0 && c <= 32) { // space, tab, newline, etc.
			if (start !== -1) {
				emitToken(tokens, str, start, i);
				start = -1;
			}
			continue;
		}

		// Pipe: |
		if (quote === 0 && c === 124) {
			if (start !== -1) emitToken(tokens, str, start, i);
			tokens.push([TOKEN_PIPE, i, i + 1]);
			start = -1;
			continue;
		}

		// Colon: :
		if (quote === 0 && c === 58) {
			if (start !== -1) emitToken(tokens, str, start, i);
			tokens.push([TOKEN_COLON, i, i + 1]);
			start = -1;
			continue;
		}

		// Arrow: =>
		if (quote === 0 && c === 61 && i + 1 < len && str.charCodeAt(i + 1) === 62) {
			if (start !== -1) emitToken(tokens, str, start, i);
			tokens.push([TOKEN_ARROW, i, i + 2]);
			start = -1;
			i++; // skip '>'
			continue;
		}

		// Equal: =
		if (quote === 0 && c === 61) {
			if (start !== -1) emitToken(tokens, str, start, i);
			tokens.push([TOKEN_EQUAL, i, i + 1]);
			start = -1;
			continue;
		}

		// Start of new token
		if (start === -1) {
			start = i;
		}
	}

	// Final token
	if (quote !== 0) {
		throw new Error(`Unclosed quoted string starting at index ${start}: ${str}`);
	}

	if (start !== -1) {
		emitToken(tokens, str, start, len);
	}

	tokens.push([TOKEN_EOF, len, len]);

	return tokens;
}