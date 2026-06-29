/**
 * Quote-aware scanner utilities.
 *
 * These helpers are intended as the foundation
 * for Udodi's lexer and directive parser.
 */

/**
 * Scanner mode: split on delimiter.
 *
 * @type {number}
 */
export const SCAN_DELIMITER = 1;

/**
 * Scanner mode: split on whitespace.
 *
 * @type {number}
 */
export const SCAN_WHITESPACE = 2;

/**
 * Returns true if character is a quote.
 *
 * @param {string} ch - Character.
 * @returns {boolean}
 */
export function isQuote(ch) {
	return ch === "'" || ch === '"';
}

/**
 * Counts consecutive backslashes before an index
 * to determine if a character is escaped.
 *
 * @param {string} str - String to inspect.
 * @param {number} index - Position to check.
 * @returns {boolean} True if escaped.
 */
export function isEscaped(str, index) {
	let i = index;
	let n = 0;

	while (--i >= 0) {
		if (str.charCodeAt(i) !== 92) break;
		n++;
	}

	return (n & 1) === 1;
}

/**
 * Returns true if string is enclosed
 * by matching quotes.
 *
 * Examples:
 *
 * "hello" or 'hello'
 *
 * @param {string} str
 * @returns {boolean}
 */
export function isQuotedString(str) {
	const len = str.length;
	if (len < 2) return false;

	const first = str.charCodeAt(0);

	// 34 = ", 39 = '
	if (first !== 34 && first !== 39) return false;

	return str.charCodeAt(len - 1) === first;
}

/**
 * Removes surrounding quotes and
 * unescapes quoted content.
 *
 * Examples:
 *
 * "'hello'" -> "hello"
 * "'it\\'s'" -> "it's"
 *
 * @param {string} str
 * @returns {string}
 */
export function unquoteString(str) {
	if (!isQuotedString(str)) {
		return str;
	}

	const len = str.length;

	let result = "";

	for (let i = 1; i < len - 1; i++) {
		const c = str.charCodeAt(i);

		// '\'
		if (c === 92 && i + 1 < len - 1) {
			result += str[++i];
			continue;
		}

		result += str[i];
	}

	return result;
}

/**
 * Scans a string while respecting
 * quoted regions.
 *
 * Emits token ranges.
 *
 * Callback receives:
 *
 * (start, end)
 *
 * where:
 *
 * str.slice(start, end)
 *
 * is the token.
 *
 * @param {string} str
 * @param {(start:number,end:number)=>void} onToken
 * @param {number} mode
 * @param {string|null} [delimiter=null]
 */
export function scanQuoted(str, onToken, mode, delimiter = null) {
	const len = str.length;

	if (len === 0) {
		return;
	}

	let quote = 0;
	let escaped = false;
	let start = 0;

	const delimCode =
		mode === SCAN_DELIMITER && delimiter ? delimiter.charCodeAt(0) : 0;

	for (let i = 0; i < len; i++) {
		const c = str.charCodeAt(i);

		// Escape
		if (c === 92 && !escaped) {
			escaped = true;
			continue;
		}

		// Quote handling
		if ((c === 34 || c === 39) && !escaped) {
			if (quote === 0) {
				quote = c;
			} else if (quote === c) {
				quote = 0;
			}

			continue;
		}

		escaped = false;

		// ----------------------------------
		// Delimiter mode
		// ----------------------------------

		if (mode === SCAN_DELIMITER && quote === 0 && c === delimCode) {
			onToken(start, i);
			start = i + 1;
			continue;
		}

		// ----------------------------------
		// Whitespace mode
		// ----------------------------------

		if (mode === SCAN_WHITESPACE && quote === 0 && c <= 32) {
			if (start < i) {
				onToken(start, i);
			}

			i++;

			while (i < len && str.charCodeAt(i) <= 32) {
				i++;
			}

			start = i;
			i--;
		}
	}

	if (quote !== 0) {
		throw new Error(`Unclosed quoted string: ${str}`);
	}

	onToken(start, len);
}

/**
 * Splits a string by delimiter
 * outside quoted regions.
 *
 * Empty tokens are preserved.
 *
 * Examples:
 *
 * a:b:c
 * -> ["a","b","c"]
 *
 * a::c
 * -> ["a","","c"]
 *
 * @param {string} str
 * @param {string} delimiter
 * @returns {string[]}
 */
export function splitUnquoted(str, delimiter) {
	if (!str) {
		return [];
	}

	const tokens = [];

	scanQuoted(
		str,
		(start, end) => {
			tokens.push(str.slice(start, end));
		},
		SCAN_DELIMITER,
		delimiter,
	);

	return tokens;
}

/**
 * Normalizes a directive expression.
 *
 * Rules:
 * - Trims leading/trailing whitespace.
 * - Collapses consecutive whitespace outside quotes to a single space.
 * - Removes whitespace before and after:
 *   - :
 *   - .
 *   - |
 *   - =
 *   - =>
 * - Preserves quoted strings verbatim.
 *
 * Examples:
 *
 * - name : arg        --> name:arg
 * - user . profile    --> user.profile
 * - a  b   c          --> a b c
 * - a | upper         --> a|upper
 * - click = save      --> click=save
 * - a =>  b           --> a=>b
 * - "a : b"           --> "a : b"
 *
 * @param {string} input Directive expression.
 * @returns {string} Normalized directive expression.
 */
export function normalizeDirective(input) {
	if (input.length === 0) {
		return "";
	}

	const len = input.length;
	const out = new Array(len);

	let outLen = 0;
	let i = 0;
	let quote = 0; // 0 | 34 | 39
	let pendingSpace = false;

	while (i < len) {
		const c = input.charCodeAt(i);

		// Quoted string context
		if (quote !== 0) {
			out[outLen++] = input[i];

			// Escaped quotes like \"
			if (c === 92 && i + 1 < len) {
				out[outLen++] = input[++i];
			} else if (c === quote) {
				quote = 0;
			}

			i++;
			continue;
		}

		// Open quote
		if (c === 34 || c === 39) {
			if (pendingSpace && outLen > 0) {
				out[outLen++] = " ";
			}
			pendingSpace = false;
			quote = c;
			out[outLen++] = input[i++];
			continue;
		}

		// Whitespace
		if (c <= 32) {
			pendingSpace = outLen > 0;
			i++;
			continue;
		}

		// Arrow token: =>
		if (c === 61 && i + 1 < len && input.charCodeAt(i + 1) === 62) {
			pendingSpace = false;
			out[outLen++] = "=";
			out[outLen++] = ">";
			i += 2;

			while (i < len && input.charCodeAt(i) <= 32) {
				i++;
			}

			continue;
		}

		// Structural tokens: :, ., |, =
		if (c === 58 || c === 46 || c === 124 || c === 61) {
			pendingSpace = false;
			out[outLen++] = input[i++];

			while (i < len && input.charCodeAt(i) <= 32) {
				i++;
			}

			continue;
		}

		// Normal character
		if (pendingSpace) {
			out[outLen++] = " ";
			pendingSpace = false;
		}

		out[outLen++] = input[i++];
	}

	out.length = outLen;
	return out.join("");
}
