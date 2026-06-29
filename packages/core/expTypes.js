/**
 * Expression and Node Types for Udodi AST
 *
 * These constants define the different types of nodes in the Abstract Syntax Tree (AST)
 * produced by the parser and consumed by the compiler and evaluator.
 *
 * Numeric values are used for performance (fast switch statements).
 */

/**
 * Literal value: string, number, or boolean.
 */
export const EXPR_LITERAL = 1;

/**
 * Path expression (e.g. `user.name`, `count`)
 */
export const EXPR_PATH = 2;

/**
 * Function call expression using colon syntax (e.g. `formatDate:createdAt:'MMM DD'`)
 */
export const EXPR_CALL = 3;

/**
 * Conditional expression using arrow syntax (e.g. `isActive => 'active'`)
 */
export const EXPR_CONDITIONAL = 4;

/**
 * Pipeline expression (e.g. `value | uppercase | trim`)
 */
export const EXPR_PIPELINE = 5;

/**
 * Root node containing all bindings in a directive.
 */
export const NODE_DIRECTIVE = 10;

/**
 * Regular data binding (e.g. `text = user.name | uppercase`)
 */
export const NODE_BINDING = 11;

/**
 * Event binding (e.g. `on[click.prevent] = handleClick`)
 */
export const NODE_EVENT_BINDING = 12;

/**
 * Human-readable names for expression and node types.
 * Useful for debugging, error messages, and logging.
 *
 * @type {Record<number, string>}
 */
export const TYPE_NAMES = {
	[EXPR_LITERAL]: "EXPR_LITERAL",
	[EXPR_PATH]: "EXPR_PATH",
	[EXPR_CALL]: "EXPR_CALL",
	[EXPR_CONDITIONAL]: "EXPR_CONDITIONAL",
	[EXPR_PIPELINE]: "EXPR_PIPELINE",

	[NODE_DIRECTIVE]: "NODE_DIRECTIVE",
	[NODE_BINDING]: "NODE_BINDING",
	[NODE_EVENT_BINDING]: "NODE_EVENT_BINDING",
};