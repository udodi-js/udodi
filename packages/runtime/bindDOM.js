import { createSignal, effect } from "../reactivity/index.js";
import {
	normalizeDirective,
	isQuotedString,
	isQuote,
	unquoteString,
} from "../utils/tokenizer.js";
import { OP_EVENT_BIND } from "../core/opcodes.js";
import { lexDirective } from "../core/lexer.js";
import { parseDirective } from "../core/parser.js";
import { compile } from "../core/compiler.js";

// Global instruction cache to ensure we parse and compile each directive exactly once.
// Uses the raw directive string as the cache key.
const instructionCache = new Map();

/**
 * Retrieves VM instructions for a directive, returning cached instructions if available.
 * If not cached, it lexes, parses, and compiles the directive, then stores the result.
 *
 * This function implements memoization to avoid redundant parsing/compilation of
 * the same directive string.
 *
 * @param {string} directive - The raw directive string (e.g. a template expression).
 * @returns {Array<Object>} Compiled VM instructions.
 * @throws {Error} May throw errors from `lexDirective`, `parseDirective`, or `compile` if the directive is malformed.
 */
function getOrCompileInstructions(directive) {
	let instructions = instructionCache.get(directive);

	if (!instructions) {
		const tokens = lexDirective(directive);
		const ast = parseDirective(tokens, directive);

		instructions = compile(ast);
		instructionCache.set(directive, instructions);
	}

	return instructions;
}

/**
 * Processes `@ref` directives.
 *
 * Registers referenced elements on `context.refs`.
 *
 * Examples:
 *
 * @ref="button"
 * @ref="'button'"
 *
 * Both forms register:
 *
 * context.refs.button = element
 *
 * @param {HTMLElement[]} nodes - Elements containing an `@ref` directive.
 * @param {Object} vm - Virtual machine instance. (Unused, kept for API consistency.)
 * @param {Object} context - Component context containing the `refs` object.
 */
function processRefDirective(nodes, vm, context) {
	const refs = context.refs;

	for (let i = 0, nodesLength = nodes.length; i < nodesLength; i++) {
		const elem = nodes[i];
		const expr = elem.getAttribute("@ref").trim();

		if (!expr) {
			continue;
		}

		try {
			const key = isQuotedString(expr) ? unquoteString(expr) : expr;

			if (key === "") {
				console.warn("[@ref] Ref name cannot be empty.");
				continue;
			}

			refs[key] = elem;
			elem.removeAttribute("@ref");

		} catch (err) {
			console.warn("[@ref] Invalid directive:", err);
		}
	}
}

/**
 * Processes `@text` directives: sets reactive textContent.
 *
 * @param {HTMLElement[]} nodes - Elements with `@text`.
 * @param {Object} vm - The virtual machine instance.
 * @param {Object} context - Evaluation context.
 * @param {Object} scope - Effect scope.
 */
function processTextDirective(nodes, vm, context, scope) {
	const cleanups = scope.cleanups;

	for (let i = 0, nodesLength = nodes.length; i < nodesLength; i++) {
		const elem = nodes[i];
		const expr = elem.getAttribute("@text");

		if (!expr) continue;

		try {
			if (isQuotedString(expr)) {
				elem.textContent = unquoteString(expr);
				elem.removeAttribute("@text");
				continue;
			}

			if (isQuote(expr[0])) {
				console.warn(`[@text] Invalid quoted directive usage: ${expr}`);
				elem.removeAttribute("@text");
				continue;
			}

			// Canonicalization of directive.
			const directive = "text=" + normalizeDirective(expr);
			const instructions = getOrCompileInstructions(directive);

			const dispose = effect(() => {
				try {
					const results = vm.execute(instructions, context);

					if (results.length > 0) {
						elem.textContent = String(results[0].value);
						return;
					}

					elem.textContent = "";

				} catch (err) {
					console.warn(`[@text] Error evaluating "${expr}":`, err);
					elem.textContent = "";
				}
			}, scope);

			cleanups.push(dispose);
			elem.removeAttribute("@text");

		} catch (err) {
			console.warn("[@text] Invalid directive:", err);
		}
	}
}

/**
 * Processes `@show` directives.
 *
 * The expression must evaluate to a boolean.
 *
 * When the result is:
 *
 * - `true`  → the element is shown.
 * - `false` → the element is hidden.
 *
 * Unlike a traditional `@if`, this directive never removes or recreates
 * DOM nodes. It simply toggles the element's `hidden` property.
 *
 * @param {HTMLElement[]} nodes - Elements containing an `@show` directive.
 * @param {Object} vm - Virtual machine instance.
 * @param {Object} context - Runtime evaluation context.
 * @param {Object} scope - Reactive effect scope.
 */
function processShowDirective(nodes, vm, context, scope) {
	const cleanups = scope.cleanups;

	for (let i = 0, nodesLength = nodes.length; i < nodesLength; i++) {
		const elem = nodes[i];
		const expr = elem.getAttribute("@show");

		if (!expr) continue;

		try {
			if (isQuotedString(expr)) {
				console.warn(
					`[@show] Invalid directive "${expr}". ` +
					"Expected a boolean expression, not a string literal.",
				);
				continue;
			}

			// Canonicalization of directive.
			const directive = "show=" + normalizeDirective(expr);
			const instructions = getOrCompileInstructions(directive);

			const dispose = effect(() => {
				try {
					const results = vm.execute(instructions, context);

					// A @show directive always produces a single result.
					const visible = results[0]?.value;

					elem.hidden = !visible;

				} catch (err) {
					console.warn(`[@show] Error evaluating "${expr}":`, err);
				}

			}, scope);

			cleanups.push(dispose);
			elem.removeAttribute("@show");

		} catch (err) {
			console.warn("[@show] Invalid directive:", err);
		}
	}
}

/**
 * Processes `@if` conditional directive chains.
 *
 * A conditional chain begins with an `@if` element and may be followed by
 * zero or more immediately adjacent `@elseif` elements and at most one
 * `@else` element.
 *
 * @example
 * ```html
 * <div @if="loading">Loading...</div>
 * <div @elseif="error">Error occurred</div>
 * <div @else>Content loaded successfully</div>
 * ```
 *
 * The chain is evaluated by a single reactive effect. The first branch whose
 * condition evaluates to `true` is dynamically mounted into the DOM while all
 * remaining structural branches are unmounted. If no condition matches, the
 * `@else` branch (if present) is mounted. Non-matching nodes are replaced by
 * a silent comment placeholder node to preserve layout position.
 *
 * Rules:
 * - `@if` and `@elseif` expressions must evaluate to booleans.
 * - `@else` must not have an expression.
 * - Only one `@else` is allowed per chain.
 * - `@elseif`/`@else` must immediately follow the previous branch.
 *
 * @param {HTMLElement[]} nodes - Elements containing an `@if` directive.
 * @param {Object} vm - Virtual machine instance.
 * @param {Object} context - Runtime evaluation context.
 * @param {Object} scope - Reactive effect scope.
 */
function processIfDirective(nodes, vm, context, scope) {
	const cleanups = scope.cleanups;

	for (let i = 0, nodesLength = nodes.length; i < nodesLength; i++) {
		const root = nodes[i];
		const expr = root.getAttribute("@if");

		if (!expr) continue;

		if (isQuotedString(expr)) {
			console.warn(
				`[@if] Invalid directive "${expr}". ` +
				"Expected a boolean expression, not a string literal.",
			);
			continue;
		}

		const parent = root.parentNode;

		try {
			/** @type {{node: HTMLElement, instructions?: *, isElse: boolean}[]} */
			const branches = [];

			// Structural Discovery Phase
			let node = root;
			let foundElse = false;
			let isSecondNode = false;

			while (node !== null) {
				// If we encounter a secondary @if, it belongs to another chain.
				if (isSecondNode && node.hasAttribute("@if")) {
					break;
				}

				isSecondNode = true;

				if (node.hasAttribute("@if")) {
					const expression = node.getAttribute("@if");
					branches.push({
						node,
						instructions: getOrCompileInstructions(
							"if=" + normalizeDirective(expression),
						),
						isElse: false,
					});
					node.removeAttribute("@if");

				} else if (node.hasAttribute("@elseif")) {
					if (foundElse) {
						throw new Error("@elseif cannot appear after @else.");
					}

					const expression = node.getAttribute("@elseif");
					if (!expression) {
						throw new Error("@elseif requires an expression.");
					}
					if (isQuotedString(expression)) {
						throw new Error("@elseif requires a boolean expression.");
					}

					branches.push({
						node,
						instructions: getOrCompileInstructions(
							"elseif=" + normalizeDirective(expression),
						),
						isElse: false,
					});
					node.removeAttribute("@elseif");

				} else if (node.hasAttribute("@else")) {
					if (foundElse) {
						throw new Error("Only one @else is allowed.");
					}
					foundElse = true;

					branches.push({
						node,
						isElse: true,
					});
					node.removeAttribute("@else");
					break;

				} else {
					break;
				}

				node = node.nextElementSibling;
			}

			// Structural Pruning Phase.
			const branchesLength = branches.length;
			const anchor = document.createComment("@if");
			parent.insertBefore(anchor, root);

			for (let j = 0; j < branchesLength; j++) {
				const branchNode = branches[j].node;
				if (branchNode.parentNode === parent) {
					parent.removeChild(branchNode);
				}
			}

			// Track state matching via direct numeric array index pointers
			let currentActiveIndex = -1;

			// Reactive Evaluation Phase (One isolated runtime effect per chain)
			const dispose = effect(() => {
				try {
					let matchedIndex = -1;

					for (let j = 0; j < branchesLength; j++) {
						const branch = branches[j];

						if (branch.isElse) {
							matchedIndex = j;
							break;
						}

						const results = vm.execute(branch.instructions, context);
						const visible = results[0]?.value;

						if (visible) {
							matchedIndex = j;
							break;
						}
					}

					// Strict numerical short-circuit check eliminates object payload equality loops
					if (matchedIndex === currentActiveIndex) {
						return;
					}

					// Remove current active branch explicitly via cached parent references
					if (currentActiveIndex !== -1) {
						const activeNode = branches[currentActiveIndex].node;
						if (activeNode.parentNode === parent) {
							parent.removeChild(activeNode);
						}
					}

					// Insert the new active target matching branch node configuration
					if (matchedIndex !== -1) {
						parent.insertBefore(branches[matchedIndex].node, anchor);
					}

					currentActiveIndex = matchedIndex;

				} catch (err) {
					console.warn(`[@if] Error evaluating "${expr}":`, err);
				}

			}, scope);

			cleanups.push(dispose);

			// Scope context tracking closure cleanup to explicitly free heap pointers
			cleanups.push(() => {
				branches.length = 0;
				if (anchor.parentNode === parent) {
					parent.removeChild(anchor);
				}
			});

		} catch (err) {
			console.warn("[@if] Invalid directive chain definition:", err);
		}
	}
}

/**
 * Validates that no orphaned `@elseif` directives remain uncompiled in the template.
 * 
 * @param {HTMLElement[]} [nodes] - Elements containing an `@elseif` directive.
 */
function processElseIfDirective(nodes) {
    if (!nodes) return;

    for (let i = 0, len = nodes.length; i < len; i++) {
        // If it still has the attribute, it was never stripped by a leading @if master chain
        if (nodes[i].hasAttribute("@elseif")) {
            throw new SyntaxError(
                "[@elseif] Compilation Error: Orphaned @elseif directive found. " +
                "An @elseif must immediately follow an @if or another @elseif block."
            );
        }
    }
}

/**
 * Validates that no orphaned `@else` directives remain uncompiled in the template.
 * 
 * @param {HTMLElement[]} [nodes] - Elements containing an `@else` directive.
 */
function processElseDirective(nodes) {
    if (!nodes) return;

    for (let i = 0, len = nodes.length; i < len; i++) {
        // If it still has the attribute, it was never stripped by a leading @if master chain
        if (nodes[i].hasAttribute("@else")) {
            throw new SyntaxError(
                "[@else] Compilation Error: Orphaned @else directive found. " +
                "An @else must immediately follow an @if or @elseif block."
            );
        }
    }
}

/**
 * Transforms shorthand event bindings into VM-friendly event bindings.
 *
 * Example:
 * ```txt
 * keydown.enter.stop=submit:message click=save
 * ```
 *
 * Becomes:
 * ```txt
 * on[keydown.enter.stop]=submit:message on[click]=save
 * ```
 *
 * The function performs a single-pass scan of the input string.
 * Each whitespace-delimited token is expected to follow the format:
 *
 * ```txt
 * event[.modifier...]=handler[:arg...]
 * ```
 *
 * Tokens that do not contain an `=` character are copied unchanged, and
 * quoted strings are preserved verbatim and may contain escaped quotes.
 *
 * @param {string} input - Event binding expression string.
 * @returns {string} Transformed event binding expression.
 */
function transformEvents(input) {
	let out = "";
	let tokenStart = 0;
	let eq = -1;
	let quote = 0;

	for (let i = 0, len = input.length; i <= len; i++) {
		const end = i === len;

		if (!end) {
			const ch = input.charCodeAt(i);

			// Skip escaped characters inside quotes
			if (
				quote !== 0 &&
				ch === 92 && // '\'
				i + 1 < len
			) {
				i++;
				continue;
			}

			// Enter/leave quoted section
			if (ch === 34 || ch === 39) {
				// " or '
				if (quote === 0) {
					quote = ch;
				} else if (quote === ch) {
					quote = 0;
				}

				continue;
			}

			if (quote !== 0) {
				continue;
			}

			if (ch === 61 && eq === -1) {
				// =
				eq = i;
				continue;
			}

			if (ch !== 32) {
				// not space
				continue;
			}
		}

		// End of token
		if (i > tokenStart) {
			if (eq !== -1) {
				out +=
					"on[" + input.slice(tokenStart, eq) + "]=" + input.slice(eq + 1, i);
			} else {
				out += input.slice(tokenStart, i);
			}

			if (!end) {
				out += " ";
			}
		}

		tokenStart = i + 1;
		eq = -1;
	}

	return out;
}

/**
 * Processes `@on` directives.
 *
 * Each directive is normalized, compiled into VM instructions, and the
 * corresponding event listeners are bound to the element. A cleanup
 * callback is registered for every bound listener so it can be removed
 * automatically when the component is destroyed.
 *
 * Example:
 * ```html
 * @on="click=save keydown.enter.stop=submit"
 * ```
 *
 * @param {HTMLElement[]} nodes - Elements containing an `@on` directive.
 * @param {Object} vm - Virtual machine instance.
 * @param {Object} context - Runtime evaluation context.
 * @param {Object} scope - Reactive effect scope.
 */
function processEventDirective(nodes, vm, context, scope) {
	const cleanups = scope.cleanups;
	const nodesLength = nodes.length;

	for (let i = 0; i < nodesLength; i++) {
		const elem = nodes[i];
		const expr = elem.getAttribute("@on");

		if (!expr) continue;

		try {
			const directive = transformEvents(normalizeDirective(expr));
			const instructions = getOrCompileInstructions(directive);

			for (let j = 0, length = instructions.length; j < length; j++) {
				const instruction = instructions[j];

				if (instruction.op !== OP_EVENT_BIND) {
					continue;
				}

				vm.bindEvent(elem, instruction, context);

				cleanups.push(() => {
					vm.unbindEvent(elem, instruction.event, instruction.modifiers);
				});
			}

			// Remove the processed directive.
			elem.removeAttribute("@on");

		} catch (err) {
			console.warn("[@on] Invalid directive:", err);
		}
	}
}

/**
 * Returns the CSS classes assigned to an element.
 *
 * Empty class tokens caused by consecutive spaces are ignored.
 *
 * @param {Element} element
 * @returns {string[]} Array of class names.
 */
function getElementClasses(element) {
	const raw = element.className;

	if (!raw) {
		return [];
	}

	const parts = raw.split(" ");
	const result = [];

	for (let i = 0, length = parts.length; i < length; i++) {
		const token = parts[i];

		if (token !== "") {
			result.push(token);
		}
	}

	return result;
}

/**
 * Processes `@class` directives.
 *
 * Supports:
 * - Static classes:
 *   ```html
 *   @class="'btn primary'"
 *   ```
 *
 * - Dynamic expressions:
 *   ```html
 *   @class="isActive=>'active' sizeClass"
 *   ```
 *
 * Dynamic classes are diffed against the previous render so only the
 * necessary DOM mutations are performed.
 *
 * @param {HTMLElement[]} nodes - Elements containing an `@class` directive.
 * @param {Object} vm - Virtual machine instance.
 * @param {Object} context - Runtime evaluation context.
 * @param {Object} scope - Reactive effect scope.
 */
function processClassDirective(nodes, vm, context, scope) {
	const cleanups = scope.cleanups;

	for (let i = 0, nodesLength = nodes.length; i < nodesLength; i++) {
		const elem = nodes[i];
		const expr = elem.getAttribute("@class");

		if (!expr) continue;

		try {
			const classes = elem.classList;

			// Static classes.
			if (isQuotedString(expr)) {
				const tokens = unquoteString(expr).split(" ");

				for (let j = 0, len = tokens.length; j < len; j++) {
					const token = tokens[j];

					if (token !== "") {
						classes.add(token);
					}
				}

				elem.removeAttribute("@class");
				continue;
			}

			// Cache original classes once.
			const baseClasses = new Set(getElementClasses(elem));

			// Canonicalization of class directive.
			const bindings = normalizeDirective(expr).split(" ");
			const directive = "class=" + bindings.join(" class=");

			const instructions = getOrCompileInstructions(directive);

			/** @type {Set<string>} */
			let nextDynamicClasses = new Set();

			/**
			 * Dynamic classes currently applied by this directive.
			 *
			 * Base classes are never stored here.
			 *
			 * @type {Set<string>}
			 */
			let previousDynamicClasses = new Set();

			const dispose = effect(() => {
				try {
					const results = vm.execute(instructions, context);

					nextDynamicClasses.clear();

					for (let j = 0, len = results.length; j < len; j++) {
						const value = results[j].value;

						if (value === null || value === undefined || value === "") {
							continue;
						}

						if (typeof value === "string") {
							// "class1 class2 ..."
							const tokens = value.split(" ");

							for (let n = 0, tokenLen = tokens.length; n < tokenLen; n++) {
								const token = tokens[n];

								if (token !== "") {
									nextDynamicClasses.add(token);
								}
							}

							continue;
						}

						if (Array.isArray(value)) {
							// ["class1", "class2", ...]
							for (let n = 0, valueLen = value.length; n < valueLen; n++) {
								const item = value[n];

								if (typeof item !== "string") {
									continue;
								}

								const token = item.trim();

								if (token !== "") {
									nextDynamicClasses.add(token);
								}
							}
						}
					}

					// Remove classes no longer required.
					for (const cls of previousDynamicClasses) {
						if (!nextDynamicClasses.has(cls) && !baseClasses.has(cls)) {
							classes.remove(cls);
						}
					}

					// Add newly introduced classes.
					for (const cls of nextDynamicClasses) {
						if (!previousDynamicClasses.has(cls)) {
							classes.add(cls);
						}
					}

					// Swap maps.
					const tmp = previousDynamicClasses;
					previousDynamicClasses = nextDynamicClasses;
					nextDynamicClasses = tmp;

				} catch (err) {
					console.warn(`[@class] Error evaluating "${expr}":`, err);
				}
			}, scope);

			cleanups.push(dispose);
			elem.removeAttribute("@class");

		} catch (err) {
			console.warn("[@class] Invalid directive:", err);
		}
	}
}

/**
 * Parses a CSS declaration string into a style map.
 *
 * Example:
 *
 * "color:red;background:blue"
 *
 * becomes:
 *
 * Map {
 *   "color" => "red",
 *   "background" => "blue"
 * }
 *
 * Invalid declarations are ignored.
 *
 * @param {string} css - CSS declaration string.
 * @param {Map<string, string>} out - Destination map.
 */
function parseStyleString(css, out) {
	const declarations = css.split(";");

	for (let i = 0, len = declarations.length; i < len; i++) {
		const declaration = declarations[i];

		if (!declaration) {
			continue;
		}

		const colon = declaration.indexOf(":");

		if (colon === -1) {
			continue;
		}

		const property = declaration.slice(0, colon).trim();
		const value = declaration.slice(colon + 1).trim();

		if (property && value) {
			out.set(property, value);
		}
	}
}

/**
 * Applies a literal CSS declaration string.
 *
 * @param {CSSStyleDeclaration} style - Element style object.
 * @param {string} css - CSS declaration string.
 */
function applyStyleString(style, css) {
	const map = new Map();

	parseStyleString(css, map);

	for (const [property, value] of map) {
		style.setProperty(property, value);
	}
}

/**
 * Processes `@style` directives.
 *
 * Supported forms:
 *
 * @style="'color:red;background:blue'"
 * @style="styleA styleB styleC"
 *
 * Each binding may return:
 *
 * - "color:red;background:blue"
 * - [["color","red"],["background","blue"]]
 * - { color:"red", background:"blue" }
 * - null / undefined / ""
 *
 * Returning `null`, `undefined` or `""` removes only the styles previously
 * contributed by that binding while preserving existing inline styles.
 *
 * @param {HTMLElement[]} nodes - Elements containing an `@style` directive.
 * @param {Object} vm - Virtual machine instance.
 * @param {Object} context - Runtime evaluation context.
 * @param {Object} scope - Reactive effect scope.
 */
function processStyleDirective(nodes, vm, context, scope) {
	const cleanups = scope.cleanups;

	for (let i = 0, nodesLength = nodes.length; i < nodesLength; i++) {
		const elem = nodes[i];
		const expr = elem.getAttribute("@style");

		if (!expr) continue;

		try {
			const style = elem.style;

			// Static literal style.
			if (isQuotedString(expr)) {
				applyStyleString(style, unquoteString(expr));
				elem.removeAttribute("@style");
				continue;
			}

			/**
			 * Styles already present on the element before processing `@style`.
			 *
			 * @type {Map<string, string>}
			 */
			const baseStyles = new Map();

			for (let j = 0, len = style.length; j < len; j++) {
				const property = style[j];
				baseStyles.set(property, style.getPropertyValue(property));
			}

			// Canonicalization of style directive
			const bindings = normalizeDirective(expr).split(" ");
			const directive = "style=" + bindings.join(" style=");

			const instructions = getOrCompileInstructions(directive);

			/**
			 * Styles produced by each binding.
			 *
			 * binding index -> Map(property,value)
			 *
			 * @type {Map<number, Map<string, string>>}
			 */
			const bindingStyles = new Map();

			/** @type {Map<string, string>} */
			let nextMergedStyles = new Map();

			/**
			 * Previously merged styles applied by this directive.
			 *
			 * @type {Map<string, string>}
			 */
			let previousMergedStyles = new Map();

			const dispose = effect(() => {
				try {
					const results = vm.execute(instructions, context);

					nextMergedStyles.clear();

					for (let j = 0, len = results.length; j < len; j++) {
						const value = results[j].value;

						let map = bindingStyles.get(j);

						if (!map) {
							map = new Map();
							bindingStyles.set(j, map);
						} else {
							map.clear();
						}

						if (value === null || value === undefined || value === "") {
							continue;
						}

						if (typeof value === "string") {
							parseStyleString(value, map);
						} else if (Array.isArray(value)) {
							for (let n = 0, alen = value.length; n < alen; n++) {
								const pair = value[n];

								if (Array.isArray(pair) && pair.length >= 2) {
									const property = String(pair[0]).trim();
									const cssValue = String(pair[1]).trim();

									if (property !== "" && cssValue !== "") {
										map.set(property, cssValue);
									}
								}
							}
						} else if (typeof value === "object") {
							const keys = Object.keys(value);

							for (let n = 0, klen = keys.length; n < klen; n++) {
								const property = keys[n];
								const cssValue = String(value[property]).trim();

								if (cssValue !== "") {
									map.set(property, cssValue);
								}
							}
						}

						// Merge. Later bindings override earlier ones.
						for (const [property, cssValue] of map) {
							nextMergedStyles.set(property, cssValue);
						}
					}

					// Remove deleted styles.
					for (const [property] of previousMergedStyles) {
						if (!nextMergedStyles.has(property)) {
							if (baseStyles.has(property)) {
								style.setProperty(property, baseStyles.get(property));
							} else {
								style.removeProperty(property);
							}
						}
					}

					// Add/update changed styles.
					for (const [property, cssValue] of nextMergedStyles) {
						if (previousMergedStyles.get(property) !== cssValue) {
							style.setProperty(property, cssValue);
						}
					}

					// Swap maps.
					const tmp = previousMergedStyles;
					previousMergedStyles = nextMergedStyles;
					nextMergedStyles = tmp;

				} catch (err) {
					console.warn(`[@style] Error evaluating "${expr}":`, err);
				}
			}, scope);

			cleanups.push(dispose);
			elem.removeAttribute("@style");

		} catch (err) {
			console.warn("[@style] Invalid directive:", err);
		}
	}
}

/**
 * Processes `@attr` directives.
 *
 * Supports one or more attribute bindings.
 *
 * Example:
 *
 * @attr="href=url title=tooltip aria-label=label"
 *
 * Each binding may return:
 *
 * - string
 * - number
 * - boolean
 *
 * Returning `null`, `undefined` or `""` removes the attribute contributed
 * by that binding. If the attribute originally existed on the element,
 * its original value is restored.
 *
 * @param {HTMLElement[]} nodes - Elements containing an `@attr` directive.
 * @param {Object} vm - Virtual machine instance.
 * @param {Object} context - Runtime evaluation context.
 * @param {Object} scope - Reactive effect scope.
 */
function processAttrDirective(nodes, vm, context, scope) {
	const cleanups = scope.cleanups;

	for (let i = 0, nodesLength = nodes.length; i < nodesLength; i++) {
		const elem = nodes[i];
		const expr = elem.getAttribute("@attr");

		if (!expr) continue;

		try {
			if (isQuotedString(expr)) {
				console.warn(
					`[@attr] Invalid directive "${expr}". ` +
					"Expected attribute bindings such as title='Hello' or href=url, " +
					"not a standalone string literal.",
				);
				continue;
			}

			const instructions = getOrCompileInstructions(normalizeDirective(expr));

			/**
			 * Attributes already present before processing `@attr`.
			 *
			 * @type {Map<string,string>}
			 */
			const baseAttributes = new Map();

			const attrs = elem.attributes;

			for (let j = 0, length = attrs.length; j < length; j++) {
				const attr = attrs[j];

				// Ignore template directives.
				if (attr.name.charCodeAt(0) === 64) { // '@'
					continue;
				}

				baseAttributes.set(attr.name, attr.value);
			}

			/**
			 * Previously applied attributes.
			 *
			 * @type {Map<string,string>}
			 */
			let previousAttributes = new Map();

			/**
			 * Reusable map for collecting the next set of dynamic attributes.
			 *
			 * @type {Map<string, string>}
			 */
			let nextAttributes = new Map();

			const dispose = effect(() => {
				try {
					const results = vm.execute(instructions, context);

					nextAttributes.clear();

					for (let j = 0, length = results.length; j < length; j++) {
						const result = results[j];
						const target = result.target;
						const value = result.value;

						if (value === null || value === undefined || value === "") {
							continue;
						}

						nextAttributes.set(target, String(value));
					}

					// Remove attributes no longer present.
					for (const [name] of previousAttributes) {
						if (!nextAttributes.has(name)) {
							if (baseAttributes.has(name)) {
								elem.setAttribute(name, baseAttributes.get(name));
							} else {
								elem.removeAttribute(name);
							}
						}
					}

					// Add/update attributes.
					for (const [name, value] of nextAttributes) {
						if (previousAttributes.get(name) !== value) {
							elem.setAttribute(name, value);
						}
					}

					// Swap maps.
					const temp = previousAttributes;
					previousAttributes = nextAttributes;
					nextAttributes = temp;

				} catch (err) {
					console.warn(`[@attr] Error evaluating "${expr}":`, err);
				}
			}, scope);

			cleanups.push(dispose);
			elem.removeAttribute("@attr");

		} catch (err) {
			console.warn("[@attr] Invalid directive:", err);
		}
	}
}

/**
 * @import { DirectiveGroups } from '../types/directives.d.js'
 */

/**
 * Binds directives to a DOM element by processing them with the given virtual machine.
 *
 * @param {DirectiveGroups} directives - Elements grouped by directive type.
 * @param {Object} vm - The virtual machine instance used to evaluate expressions and manage reactivity.
 * @param {Object} [context={}] - Additional evaluation context passed to the VM.
 * @param {Object} [scope={ effects: [], cleanups: [] }] - Scope object for tracking reactive effects and cleanup functions.
 * @param {Function[]} scope.effects - Array to collect reactive effects.
 * @param {Function[]} scope.cleanups - Array to collect cleanup functions.
 */
export function bindDOM(
	directives,
	vm,
	context = {},
	scope = { effects: [], cleanups: [] },
) {
	processRefDirective(directives.ref, vm, context);
	processEventDirective(directives.on, vm, context, scope);
	processTextDirective(directives.text, vm, context, scope);
	processClassDirective(directives.class, vm, context, scope);
	processStyleDirective(directives.style, vm, context, scope);
	processAttrDirective(directives.attr, vm, context, scope);
	processShowDirective(directives.show, vm, context, scope);

	processIfDirective(directives.if, vm, context, scope);
	processElseIfDirective(directives.elseif);
    processElseDirective(directives.else);
}
