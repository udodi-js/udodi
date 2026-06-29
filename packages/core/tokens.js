/**
 * Token Types for Udodi Lexer/Parser
 *
 * These constants represent all token types used during lexing and parsing
 * of Udodi directives and expressions.
 */

/**
 * End of input/file token.
 */
export const TOKEN_EOF = 0;

/**
 * Path identifier (e.g. `user.name`, `count`, `formatDate`)
 */
export const TOKEN_PATH = 1;

/**
 * String literal (e.g. `'Hello World'`, `"active"`)
 */
export const TOKEN_STRING = 2;

/**
 * Number literal (e.g. `42`, `3.14`)
 */
export const TOKEN_NUMBER = 3;

/**
 * Boolean literal (`true` or `false`)
 */
export const TOKEN_BOOLEAN = 4;

/**
 * Colon operator `:` used in function calls (e.g. `formatDate:createdAt`)
 */
export const TOKEN_COLON = 5;

/**
 * Pipe operator `|` used for pipelines (e.g. `value | uppercase`)
 */
export const TOKEN_PIPE = 6;

/**
 * Equal sign `=` used in bindings (e.g. `count = count + 1`)
 */
export const TOKEN_EQUAL = 7;

/**
 * Arrow operator `=>` used in conditional expressions (e.g. `isActive => 'active'`)
 */
export const TOKEN_ARROW = 8;

/**
 * Human-readable names for each token type.
 * Useful for debugging, error messages, and logging.
 *
 * @type {Record<number, string>}
 */
export const TOKEN_NAMES = {
	[TOKEN_EOF]: 'EOF',
	[TOKEN_PATH]: 'PATH',
	[TOKEN_STRING]: 'STRING',
	[TOKEN_NUMBER]: 'NUMBER',
	[TOKEN_BOOLEAN]: 'BOOLEAN',
	[TOKEN_COLON]: 'COLON',
	[TOKEN_PIPE]: 'PIPE',
	[TOKEN_EQUAL]: 'EQUAL',
	[TOKEN_ARROW]: 'ARROW'
};