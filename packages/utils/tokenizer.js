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
 * Returns true if string is enclosed
 * by matching quotes.
 *
 * @examples
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
 * @examples
 *
 * "'hello'" -> "hello"
 * "'it\\'s'" -> "it's"
 *
 * @param {string} str
 * @returns {string}
 */
export function unquoteString(str) {
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
 * @examples
 * 
 * - name : arg       ->  name:arg
 * - user . profile   ->  user.profile
 * - a  b   c         ->  a b c
 * - a | upper        ->  a|upper
 * - click = save     ->  click=save
 * - a =>  b          ->  a=>b
 * - "a : b"          ->  "a : b"
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
