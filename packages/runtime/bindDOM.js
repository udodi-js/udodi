import {
	createSignal, 
	effect, 
	touch
} from "../reactivity/index.js";

import { extractAllDirectives } from "./directive.js";

import {
	registerRoot,
	unregisterRoot,
	runScopeCleanup,
} from "./lifecycle.js";

import {
	normalizeDirective,
	isQuotedString,
	isQuote,
	unquoteString,
} from "../utils/tokenizer.js";

import { OP_EVENT_BIND, OP_EVAL } from "../core/opcodes.js";

import {
	EXPR_LITERAL, 
	EXPR_PATH, 
	EXPR_CALL
} from "../core/expTypes.js";

import { lexDirective } from "../core/lexer.js";
import { parseDirective } from "../core/parser.js";
import { compile } from "../core/compiler.js";

import {
	resolveContextValue, 
	resolveContextOwner, 
	createChildContext
} from "./context.js";

import { ensureOverlayRoot } from "./overlay.js";

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
	const refs = resolveContextValue(context, "refs");

	for (let i = 0, nodesLength = nodes.length; i < nodesLength; i++) {
		const elem = nodes[i];
		const expr = elem.getAttribute("@ref").trim();

		if (!expr) continue;

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
					const value = vm.evaluate(instructions[0].expr, context);

					if (value === null || value === undefined) {
						elem.textContent = "";
						return;
					}

					elem.textContent = String(value);

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
 * Safely writes a value to a nested object path and notifies the corresponding
 * root-level reactive property when a deep mutation occurs.
 *
 * This is used by the `@bind` directive to support two-way binding on nested
 * object paths in Udodi's shallow reactivity model.
 *
 * @param {Object} context - The reactive state object.
 * @param {string[]|undefined} segments - Pre-compiled path segments from the VM compiler.
 * @param {*} value - The value to assign to the destination property.
 * @returns {boolean} `true` if the assignment succeeded; otherwise `false` if
 * the path is invalid or the destination property is read-only.
 */
function setPath(context, segments, value) {
    if (!segments || segments.length === 0) {
        return false;
    }

    const last = segments.length - 1;
    const rootKey = segments[0];
	const contextOwner = resolveContextOwner(context, rootKey);

    let current = contextOwner;

    try {
        // Traverse to the parent object of the target property.
        for (let i = 0; i < last; i++) {
            current = current[segments[i]];

            if (current == null) {
                return false;
            }
        }

        const targetKey = segments[last];
        const descriptor = Object.getOwnPropertyDescriptor(current, targetKey);

        if (descriptor) {
            if ("set" in descriptor) { // Accessor property
                if (descriptor.set === undefined) {
                    return false;
                }

            } else if (descriptor.writable === false) { // Data property
                return false;
            }
        }

        // Apply the mutation.
        current[targetKey] = value;

        // Notify the root reactive property after a deep mutation.
        if (last !== 0) {
			touch(contextOwner, rootKey);
        }

        return true;

    } catch {
        return false;
    }
}

/**
 * Processes bidirectional `@bind` directives using pre-compiled VM instructions.
 * Supports deep path bindings even within a shallow reactive architecture.
 *
 * @param {HTMLElement[]} nodes - Array of DOM elements containing an active `@bind` attribute.
 * @param {Object} vm - The virtual machine compilation execution instance.
 * @param {Object} context - The runtime data evaluation context scope.
 * @param {Object} scope - The active reactive effect context lifespan tracker.
 */
function processBindDirective(nodes, vm, context, scope) {
    const cleanups = scope.cleanups;

    for (let i = 0, nodesLength = nodes.length; i < nodesLength; i++) {
		const elem = nodes[i];
		const expr = elem.getAttribute("@bind");

        if (!expr) continue;

        try {
            // Canonicalization of directive.
			const directive = "bind=" + normalizeDirective(expr);
			const instructions = getOrCompileInstructions(directive);
			const instruction = instructions[0];
            
            // Extract the pre-compiled segments array from the instruction's EXPR_PATH definition
            const pathSegments = instruction.expr.type === EXPR_PATH 
                ? instruction.expr.segments 
                : undefined;

            const isCheckbox = elem.type === "checkbox";
            const isRadio = elem.type === "radio";
            let hasTriggeredReadOnlyWarning = false;

            const dispose = effect(() => {
                const value = vm.evaluate(instruction.expr, context);
                
                if (isCheckbox) {
                    elem.checked = Boolean(value);

                } else if (isRadio) {
                    elem.checked = elem.value === String(value);

                } else {
                    const normalizedValue = value ?? "";

                    if (elem.value !== normalizedValue) {
                        elem.value = normalizedValue;
                    }
                }
				
            }, scope);

			const handleInput = () => {
                let nextValue;
                
                if (isCheckbox) {
                    nextValue = elem.checked;

                } else if (isRadio) {
                    if (!elem.checked) return;
                    nextValue = elem.value;

                } else {
                    nextValue = elem.value;
                }

                const writeSucceeded = setPath(context, pathSegments, nextValue);

                if (!writeSucceeded && !hasTriggeredReadOnlyWarning) {
                    console.warn(
						`[@bind] Failed to write an updated value to expression: "${expr}". ` +
						`This path or pipeline is read-only.`
					);
                    hasTriggeredReadOnlyWarning = true;
                }
            };

            const eventName = isCheckbox || isRadio ? "change" : "input";
			elem.addEventListener(eventName, handleInput);

            cleanups.push(dispose);
            cleanups.push(() => {
                elem.removeEventListener(eventName, handleInput);
            });

            elem.removeAttribute("@bind");

        } catch (err) {
            console.warn("[@bind] Invalid directive:", err);
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
 * - `true`  -> the element is shown.
 * - `false` -> the element is hidden.
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
					const visible = vm.evaluate(instructions[0].expr, context);
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
 * `<div @if="loading">Loading...</div>`
 * `<div @elseif="error">Error occurred</div>`
 * `<div @else>Content loaded successfully</div>`
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

		try {
			if (isQuotedString(expr)) {
				console.warn(
					`[@if] Invalid directive "${expr}". ` +
					"Expected a boolean expression, not a string literal.",
				);
				continue;
			}

			const parent = root.parentNode;

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

						const visible = vm.evaluate(branch.instructions[0].expr, context);

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
 * Whitespace around properties and values is trimmed.
 *
 * @param {string} css - CSS declaration string.
 * @param {Map<string, string>} out - Destination map.
 */
function parseStyleString(css, out) {
	const len = css.length;
	let propStart = 0;
	let colon = -1;

	for (let i = 0; i <= len; i++) {
		const isEnd = i === len;
		const ch = isEnd ? 59 : css.charCodeAt(i); // ';' or end

		if (ch === 58 && colon === -1) {           // ':'
			colon = i;
			continue;
		}

		if (ch === 59) {                           // ';'
			if (colon !== -1) {
				let propEnd = colon;
				let valStart = colon + 1;
				let valEnd = i;

				// Trim property
				while (
					propStart < propEnd && css.charCodeAt(propStart) <= 32
				) {
					propStart++;
				}
				while (
					propEnd > propStart && css.charCodeAt(propEnd - 1) <= 32
				) {
					propEnd--;
				}

				// Trim value
				while (
					valStart < valEnd && css.charCodeAt(valStart) <= 32
				) {
					valStart++
				};
				while (
					valEnd > valStart && css.charCodeAt(valEnd - 1) <= 32
				) {
					valEnd--;
				}

				if (propStart < propEnd && valStart < valEnd) {
					out.set(
						css.slice(propStart, propEnd),
						css.slice(valStart, valEnd)
					);
				}
			}

			propStart = i + 1;
			colon = -1;
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
 * @typedef {Object} FormFieldState
 * @property {HTMLElement} element - Form control element.
 * @property {boolean} valid - Whether the field currently passes validation.
 * @property {boolean} validating - Whether the field is currently being validated.
 * @property {boolean} touched - Whether the field has been interacted with.
 * @property {boolean} dirty - Whether the field value differs from its initial value.
 * @property {*} initialValue - Initial value captured during registration.
 * @property {string} [name] - Field name.
 * @property {string} [error] - Current validation error message.
 */

/**
 * @typedef {Object} FormController
 * @property {boolean} valid - Whether the form is currently valid.
 * @property {boolean} validating - Whether one or more validations are running.
 * @property {boolean} dirty - Whether one or more fields are dirty.
 * @property {boolean} touched - Whether one or more fields have been touched.
 * @property {boolean} submitting - Whether the form submit handler is executing.
 * @property {boolean} submitted - Whether the form has been successfully submitted.
 * @property {"sequential"|"parallel"} validationMode - Form validation strategy.
 * @property {(options?: {clearForm?: boolean}) => void} reset
 * Resets the form controller and optionally clears the form.
 * @property {(name: string, options?: {clearField?: boolean}) => boolean} resetField
 * Resets a specific field and optionally clears its value.
 * @property {(name: string, value: any) => boolean} setValue
 * Sets the value of a field.
 * @property {(name: string) => any} getValue
 * Returns the current value of a field.
 * @property {(name: string) => FormFieldState|FormFieldState[]|undefined} getField
 * Returns the state of a field or field group.
 */

/**
 * @typedef {Object} FormValidationState
 * @property {"sequential"|"parallel"} validationMode
 * Validation strategy used by the form.
 * @property {number} pendingValidations
 * Number of validations currently in progress.
 * @property {FormController} controller
 * Reactive form controller exposed through `context.ud.forms`.
 * @property {Array<{validate: Function, element: HTMLElement}>} validators
 * Registered field validators.
 * @property {FormFieldState[]} fields
 * Registered field states.
 * @property {Object<string, FormFieldState|FormFieldState[]>} fieldsByName
 * Lookup table of fields by name.
 * @property {WeakSet<HTMLElement>} registered
 * Tracks already-registered form controls.
 */

/**
 * Registry for form validation state and metadata.
 *
 * Maps each `<form>` element to its internal validation state.
 *
 * @type {WeakMap<HTMLFormElement, FormValidationState>}
 */
const formValidators = new WeakMap();

/**
 * Recalculates the validity of a form entry from its current
 * error collection.
 *
 * A form is considered valid when all error messages are empty strings.
 *
 * @param {Object|undefined} entry
 * Form entry created by `@form`.
 *
 * @returns {boolean}
 * Returns `true` if `controller.valid` changed; otherwise `false`.
 */
function updateFormValidity(entry) {
	if (entry === undefined) {
		return false;
	}

	const controller = entry.controller;
	const errors = controller.errors;

	let valid = true;

	for (const key in errors) {
		if (errors[key] !== "") {
			valid = false;
			break;
		}
	}

	if (controller.valid === valid) {
		return false;
	}

	controller.valid = valid;

	return true;
}

/**
 * Processes `@validate` directives.
 *
 * Registers field-level validators with the nearest parent `@form`
 * controller and manages the reactive validation state for both individual
 * fields and the form as a whole.
 *
 * Validation is not executed on mount. Validators run only after user
 * interaction according to the configured validation trigger:
 *
 * - `live`   – validates on input/change events.
 * - `lazy`   – validates on blur events.
 * - `submit` – validates only when the parent form is submitted.
 *
 * When no `@trigger` directive is present, `live` validation is used by
 * default.
 *
 * The directive accepts one or more validator expressions separated by
 * whitespace.
 *
 * Examples:
 *
 *   `@validate="required"`
 *   `@validate="required email"`
 *   `@validate="required min:8"`
 *   `@validate="between:5:10"`
 *
 * Each validator expression must resolve to a function defined on the
 * component context (typically under `methods`). Validator names are
 * flattened into the component context and therefore must be single
 * identifiers.
 *
 * Validators may be synchronous or asynchronous and may return a Promise.
 *
 * Validator signature:
 *
 *   validator(value, ...args, validationContext)
 *
 * Examples:
 *
 *   required(value, validationContext)
 *   email(value, validationContext)
 *   min(value, limit, validationContext)
 *   between(value, min, max, validationContext)
 *
 * The `validationContext` object contains information about the current
 * validation cycle:
 *
 * {
 *     trigger,    // "live" | "lazy" | "submit" | "manual"
 *     element,    // HTML form control being validated
 *     field,      // Internal field state or null
 *     form,       // Parent HTMLFormElement or null
 *     controller  // Parent form controller or undefined
 * }
 *
 * This allows validators to vary their behavior depending on the source
 * of validation:
 *
 *   required(value, ctx) {
 *       if (
 *           ctx.trigger === "submit" &&
 *           value.trim() === ""
 *       ) {
 *           return "This field is required";
 *       }
 *
 *       return true;
 *   }
 *
 * Validator return values:
 *
 *   - `true` when validation succeeds.
 *   - A non-empty string containing the validation error message when
 *     validation fails.
 *
 * Validation stops at the first failing validator and the resulting error
 * message is stored on the parent form controller:
 *
 *   `ud.forms.<formName>.errors.<fieldName>`
 *
 * Example:
 *
 *   `ud.forms.login.errors.email`
 *
 * Each validated field maintains the following reactive state:
 *
 * {
 *     element,
 *     name,
 *     touched,
 *     dirty,
 *     validating,
 *     initialValue
 * }
 *
 * The parent form controller exposes:
 *
 * {
 *     valid,
 *     validating,
 *     dirty,
 *     touched,
 *     submitting,
 *     submitted,
 *     validationMode,
 *     errors
 * }
 *
 * Example controller shape:
 *
 * {
 *     valid: true,
 *     validating: false,
 *     dirty: false,
 *     touched: false,
 *     submitting: false,
 *     submitted: false,
 *     validationMode: "sequential",
 *     errors: {
 *         email: "",
 *         password: ""
 *     }
 * }
 *
 * Validation state is coordinated using a per-form pending validation
 * counter, allowing multiple asynchronous validators to run concurrently
 * while accurately maintaining `controller.validating`.
 *
 * Form validation behavior depends on the parent `@form` validation mode:
 *
 * - `sequential`
 *   Validators execute one at a time and stop on the first failure.
 *
 * - `parallel`
 *   Validators execute concurrently and all validations are allowed to
 *   complete before the final form validity is determined.
 *
 * Validators registered by this directive are consumed automatically by
 * `@submit`.
 *
 * @param {HTMLElement[]} nodes
 * Elements containing an active `@validate` directive.
 * @param {Object} vm
 * Virtual machine instance.
 * @param {Object} context
 * Runtime evaluation context.
 * @param {Object} scope
 * Active effect scope.
 * @returns {void}
 */
function processValidateDirective(nodes, vm, context, scope) {
    const cleanups = scope.cleanups;
	const contextOwner = resolveContextOwner(context, "ud");

    for (let i = 0, nodesLength = nodes.length; i < nodesLength; i++) {
        const elem = nodes[i];
        const expr = elem.getAttribute("@validate");

        if (!expr) continue;

        try {
            if (isQuotedString(expr)) {
                console.warn(
                    `[@validate] Invalid directive "${expr}". ` +
                    "Expected an expression, not a string literal."
                );
                continue;
            }

            // Canonicalize validator expressions.
            const bindings = normalizeDirective(expr).split(" ");
			const directive = "validate=" + bindings.join(" validate=");

            const instructions = getOrCompileInstructions(directive);
            const instructionsLength = instructions.length;

			const triggerExpr = elem.getAttribute("@trigger")?.trim() || null;

			let triggerLive = false;
			let triggerLazy = false;
			let triggerSubmit = false;

			if (triggerExpr === null) {
				triggerLive = true;
			} else {
				const tokens = normalizeDirective(triggerExpr).split(" ");

				for (let i = 0, len = tokens.length; i < len; i++) {
					switch (tokens[i]) {
						case "live":
							triggerLive = true;
							break;

						case "lazy":
							triggerLazy = true;
							break;

						case "submit":
							triggerSubmit = true;
							break;

						default:
							console.warn(
								`[@trigger] Unknown trigger "${tokens[i]}".`
							);
					}
				}
			}

			/**
			 * Marks a validation cycle as started.
			 *
			 * Sets the current field's `validating` state (when applicable),
			 * increments the form's pending validation counter, and updates the
			 * form controller's `validating` flag when transitioning from zero
			 * active validations.
			 *
			 * This helper is safe for both sequential and parallel validation
			 * modes and supports overlapping asynchronous validations.
			 *
			 * @returns {void}
			 */
			const beginValidation = () => {
				if (fieldState !== null) {
					fieldState.validating = true;
				}

				if (entry !== undefined && entry.pendingValidations++ === 0) {
					entry.controller.validating = true;
				}

				touch(contextOwner, "ud");
			};

			/**
			 * Marks a validation cycle as completed.
			 *
			 * Clears the current field's `validating` state (when applicable),
			 * decrements the form's pending validation counter, and updates the
			 * form controller's `validating` flag once all active validations
			 * have finished.
			 *
			 * The pending validation count is clamped to zero to guard against
			 * mismatched begin/end calls.
			 *
			 * @returns {void}
			 */
			const endValidation = () => {
				if (fieldState !== null) {
					fieldState.validating = false;
				}

				if (entry !== undefined && --entry.pendingValidations <= 0) {
					entry.pendingValidations = 0;
					entry.controller.validating = false;
				}

				touch(contextOwner, "ud");
			};

            const type = elem.type;
            const tagName = elem.tagName;
			const changeEvent =
				type === "checkbox" ||
				type === "radio" ||
				tagName === "SELECT"
					? "change"
					: "input";

			const DEFAULT_VAL_ERROR = "Validation failed";

			/**
			 * Invokes a validator using the signature:
			 *
			 * validator(value, ...args, validationContext)
			 *
			 * @param {Function} validator
			 * @param {*} value
			 * @param {Array|undefined} args
			 * @param {Object} validationContext
			 * @returns {*}
			 */
			const invokeValidator = (
				validator,
				value,
				args,
				validationContext,
			) => {
				if (args === undefined || args.length === 0) {
					return validator(value, validationContext);
				}

				switch (args.length) {
					case 1:
						return validator(
							value,
							args[0],
							validationContext,
						);

					case 2:
						return validator(
							value,
							args[0],
							args[1],
							validationContext,
						);

					case 3:
						return validator(
							value,
							args[0],
							args[1],
							args[2],
							validationContext,
						);

					default:
						return validator(
							value,
							...args,
							validationContext,
						);
				}
			};

			const setFieldError = (name, message) => {
				if (entry === undefined || !name) {
					return;
				}

				const errors = entry.controller.errors;

				if (errors[name] !== message) {
					entry.controller.setError(name, message);
				}
			};

			const clearFieldError = (name) => {
				if (entry === undefined || !name) {
					return;
				}

				const errors = entry.controller.errors;

				if (errors[name] !== "") {
					entry.controller.resetError(name);
				}
			};

            const validate = async (triggerType = "live", event = null) => {
				beginValidation();

				try {
					// Ignore inactive radio buttons.
					if (type === "radio" && !elem.checked) {
						return true;
					}

					const value =
						type === "checkbox"
							? elem.checked
							: elem.value;

					let error = "";

					validatorLoop:
					for (let j = 0; j < instructionsLength; j++) {
						const instruction = instructions[j];

						if (instruction.op !== OP_EVAL) {
							continue;
						}

						const validatorExpr = instruction.expr;

						let validator;
						let args;

						switch (validatorExpr.type) {
							case EXPR_PATH: {
								const segments = validatorExpr.segments;

								if (segments.length !== 1) {
									console.warn(
										`[@validate] "${validatorExpr.key}" is not a valid validator. ` +
										"Validators do not support nested paths or member expressions."
									);

									error = DEFAULT_VAL_ERROR;
									break validatorLoop;
								}

								validator = resolveContextValue(
									context,
									validatorExpr.key,
								);
								break;
							}

							case EXPR_CALL: {
								validator = resolveContextValue(
									context,
									validatorExpr.name,
								);

								const exprArgs = validatorExpr.args;
								const argsLength = exprArgs.length;

								if (argsLength > 0) {
									args = new Array(argsLength);

									for (let k = 0; k < argsLength; k++) {
										args[k] = vm.evaluate(
											exprArgs[k],
											context
										);
									}
								}

								break;
							}

							default:
								console.warn(
									"[@validate] Unsupported validator expression."
								);

								error = DEFAULT_VAL_ERROR;
								break validatorLoop;
						}

						if (typeof validator !== "function") {
							console.warn(
								`[@validate] Validator "${
									validatorExpr.name ?? validatorExpr.key
								}" does not exist or is not a function.`
							);

							error = DEFAULT_VAL_ERROR;
							break;
						}

						const validationContext = {
							trigger: triggerType,
							element: elem,
							event,
						};

						let result = invokeValidator(
							validator,
							value,
							args,
							validationContext,
						);

						if (result instanceof Promise) {
							result = await result;
						}

						if (result !== true) {
							if (typeof result === "string" && result !== "") {
								error = result.trim();

							} else {
								error = DEFAULT_VAL_ERROR;   // or "Validation failed"
							}

							break;
						}
					}

					if (fieldState !== null && fieldState.name) {
						if (error === "") {
							clearFieldError(fieldState.name);
						} else {
							setFieldError(fieldState.name, error);
						}
					}

					return error === "";

				} catch (err) {
					console.warn(
						`[@validate] Error evaluating "${expr}":`, err
					);

					if (fieldState !== null && fieldState.name) {
						setFieldError(fieldState.name, DEFAULT_VAL_ERROR);
					}

					return false;

				} finally {
					endValidation();
				}
			};

			let cleanupLive = null;
			let cleanupLazy = null;
			let cleanupSubmit = null;

			const getCurrentValue = () => {
				if (type === "checkbox") return elem.checked;
				if (type === "radio") return elem.checked ? elem.value : null;
				return elem.value;
			};

			// Track field state for dirty and touched
			const form = elem.closest("form");
			const entry = form !== null ? formValidators.get(form) : undefined;

			const fieldState = entry !== undefined ? {
				element: elem,
                name: elem.name ? elem.name.trim() : "",
				validating: false,
                touched: false,
                dirty: false,
                initialValue: getCurrentValue(),
            } : null;

            const updateFormState = () => {
                if (entry === undefined) return false;

                const controller = entry.controller;
                let formTouched = false;
                let formDirty = false;

                for (let k = 0, len = entry.fields.length; k < len; k++) {
                    const field = entry.fields[k];

                    if (field.touched) {
                        formTouched = true;
                    }

                    if (field.dirty) {
                        formDirty = true;
                    }

                    if (formTouched && formDirty) {
                        break;
                    }
                }

                const changed =
					controller.touched !== formTouched ||
					controller.dirty !== formDirty;

				if (changed) {
					controller.touched = formTouched;
					controller.dirty = formDirty;
				}

				return changed;
            };

            const registerFieldState = () => {
                if (entry === undefined || fieldState === null) return;

                if (!entry.registered.has(fieldState)) {
					entry.registered.add(fieldState);
					entry.fields.push(fieldState);
				}

                const name = fieldState.name;
                if (!name) {
                    return;
                }

				const errors = entry.controller.errors;
				if (!(name in errors)) {
					errors[name] = "";
				}

                const existing = entry.fieldsByName[name];

                if (existing === undefined) {
                    entry.fieldsByName[name] = fieldState;

                } else if (Array.isArray(existing)) {
                    if (!existing.includes(fieldState)) {
                        existing.push(fieldState);
                    }

                } else if (existing !== fieldState) {
                    entry.fieldsByName[name] = [existing, fieldState];
                }
            };

            const unregisterFieldState = () => {
				if (entry === undefined || fieldState === null) {
					return;
				}

				entry.registered.delete(fieldState);

				const fields = entry.fields;
				const index = fields.indexOf(fieldState);

				if (index !== -1) {
					fields.splice(index, 1);
				}

				const name = fieldState.name;

				if (!name) {
					return;
				}

				const fieldsByName = entry.fieldsByName;
				const existing = fieldsByName[name];

				if (existing === undefined) {
					return;
				}

				if (Array.isArray(existing)) {
					const idx = existing.indexOf(fieldState);

					if (idx !== -1) {
						existing.splice(idx, 1);
					}

					if (existing.length === 1) {
						fieldsByName[name] = existing[0];

					} else if (existing.length === 0) {
						delete fieldsByName[name];
					}

				} else if (existing === fieldState) {
					delete fieldsByName[name];
				}

				// Remove the error only when no fields remain with this name.
				if (fieldsByName[name] === undefined) {
					delete entry.controller.errors[name];

					if (updateFormValidity(entry)) {
						touch(contextOwner, "ud");
					}
				}
			};

            if (fieldState !== null) {
                registerFieldState();
            }

            if (entry !== undefined) {
                if (updateFormState()) {
					touch(contextOwner, "ud");
				}
            }

            const handleFocus = () => {
				if (fieldState !== null && !fieldState.touched) {
                    fieldState.touched = true;
                    updateFormState();
					touch(contextOwner, "ud");
                }
            };

            const handleChange = () => {
                if (fieldState === null) return;

                const currentValue = getCurrentValue();

                if (currentValue !== fieldState.initialValue && !fieldState.dirty) {
                    fieldState.dirty = true;
                    updateFormState();
					touch(contextOwner, "ud");

                } else if (currentValue === fieldState.initialValue && fieldState.dirty) {
                    fieldState.dirty = false;
                    updateFormState();
					touch(contextOwner, "ud");
                }
            };

            // Run validation and ignore any errors (they are handled internally).
			const runValidate = (triggerType, event) => {
				validate(triggerType, event).catch(() => {});
			};

			elem.addEventListener("focus", handleFocus);
			elem.addEventListener(changeEvent, handleChange);

			if (triggerLive) {
				const handleLiveValidate = (event) => {
					runValidate("live", event);
				};

				elem.addEventListener(changeEvent, handleLiveValidate);
				cleanupLive = () => {
					elem.removeEventListener(changeEvent, handleLiveValidate);
				};
			}

			if (triggerLazy) {
				const handleLazyValidate = (event) => {
					runValidate("lazy", event);
				};

				elem.addEventListener("blur", handleLazyValidate);
				cleanupLazy = () => {
					elem.removeEventListener("blur", handleLazyValidate);
				};
			}

			if (triggerSubmit) {
				if (form === null) {
					console.warn(
						"[@trigger] submit requires the element to be inside a <form> with @form."
					);
				} else {
					const submitEntry = formValidators.get(form);

					if (submitEntry === undefined) {
						console.warn(
							"[@trigger] submit requires the parent <form> to have an @form directive."
						);
					} else {
						const validators = submitEntry.validators;

						validators.push({
							element: elem,
							validate,
						});

						cleanupSubmit = () => {
							for (let j = validators.length - 1; j >= 0; j--) {
								if (validators[j].validate === validate) {
									validators.splice(j, 1);
									break;
								}
							}
						};
					}
				}
			}

			// Do not validate on mount; validation should only run after user interaction.
			// Initial validation on load can confuse users opening a fresh form.

			// Cleanup closure to remove all listeners when the component is destroyed.
			cleanups.push(() => {
				cleanupLive?.();
				cleanupLazy?.();
				cleanupSubmit?.();

				// Cleanup field tracking
				elem.removeEventListener("focus", handleFocus);
				elem.removeEventListener(changeEvent, handleChange);

				if (fieldState !== null) {
					unregisterFieldState();
					if (updateFormState()) {
						touch(contextOwner, "ud");
					}
				}
			});

            elem.removeAttribute("@validate");
			if (triggerExpr !== null) elem.removeAttribute("@trigger");

        } catch (err) {
            console.warn("[@validate] Invalid directive:", err);
        }
    }
}

/**
 * Processes `@form` directives.
 *
 * Registers a reactive form controller under `context.ud.forms` and creates
 * the internal form registry consumed by `@validate` and `@submit`.
 *
 * The directive supports an optional validation mode:
 *
 *   @form="login"
 *   @form="login sequential"
 *   @form="login parallel"
 *
 * Validation modes:
 *
 * - `sequential` (default):
 *   Validators execute one at a time and validation stops on the first
 *   failure.
 *
 * - `parallel`:
 *   All validators execute concurrently and the form waits for all
 *   validations to complete before determining validity.
 *
 * Creates:
 *
 * context.ud.forms.login = {
 *     valid: true,
 *     validating: false,
 *     dirty: false,
 *     touched: false,
 *     submitting: false,
 *     submitted: false,
 *     validationMode: "sequential",
 *
 *     errors: {
 *         email: "",
 *         password: ""
 *     },
 *
 *     reset(options?),
 *     getField(name),
 *     getValue(name),
 *     setValue(name, value),
 *     resetField(name, options?),
 *     setError(name, message),
 *     resetError(name)
 * };
 *
 * The `errors` object is reactive and acts as the single source of truth for
 * form validation errors:
 *
 *   ud.forms.login.errors.email
 *   ud.forms.login.errors.password
 *
 * A form is considered valid when all values in `errors` are empty strings.
 *
 * Each field returned by `getField()` includes:
 *
 * {
 *     element,
 *     value,
 *     touched,
 *     dirty,
 *     validating,
 *     initialValue,
 *     name,
 *     type
 * }
 *
 * `getField(name)` returns:
 *
 * - `undefined` when no matching field exists.
 * - A single field state object when one field matches.
 * - An array of field state objects for grouped inputs such as radio buttons
 *   and checkboxes.
 *
 * Internally, a form entry is created:
 *
 * formValidators.set(form, {
 *     validationMode,
 *     pendingValidations: 0,
 *     controller,
 *     validators: [],
 *     fields: [],
 *     fieldsByName: Object.create(null),
 *     registered: WeakSet
 * });
 *
 * The controller and field states are reactive and can be consumed by
 * directives and expressions, for example:
 *
 *   @show="ud.forms.login.valid"
 *   @show="ud.forms.login.validating"
 *   @show="ud.forms.login.errors.email"
 *   @text="ud.forms.login.errors.email"
 *   @text="ud.forms.login.getField('email').dirty"
 *
 * Form registration automatically creates `context.ud.forms` when it does
 * not already exist.
 *
 * @param {HTMLFormElement[]} nodes
 * Form elements containing an active `@form` directive.
 * @param {Object} vm
 * Virtual machine instance.
 * @param {Object} context
 * Runtime evaluation context.
 * @param {Object} scope
 * Active reactive scope used for cleanup registration.
 * @returns {void}
 */
function processFormDirective(nodes, vm, context, scope) {
    const cleanups = scope.cleanups;
	const contextOwner = resolveContextOwner(context, "ud");

    let forms = contextOwner.ud.forms;
    if (forms === undefined) {
        forms = contextOwner.ud.forms = Object.create(null);
    }

    for (let i = 0, nodesLength = nodes.length; i < nodesLength; i++) {
        const elem = nodes[i];
        const expr = elem.getAttribute("@form").trim();

        if (!expr) continue;

        try {
            if (elem.tagName !== "FORM") {
                console.warn(
                    "[@form] Directive can only be used on <form> elements."
                );
                continue;
            }

            if (isQuotedString(expr)) {
                console.warn(
                    `[@form] Invalid directive "${expr}". ` +
                    "Expected a form identifier, not a string literal."
                );
                continue;
            }

            const tokens = normalizeDirective(expr).split(" ");

			if (tokens.length === 0 || tokens.length > 2) {
				console.warn(`[@form] Invalid directive "${expr}".`);
				continue;
			}

			const key = tokens[0];

			if (key === "") {
				console.warn(
					"[@form] Form identifier cannot be empty."
				);
				continue;
			}

			if (forms[key] !== undefined) {
                console.warn(`[@form] Duplicate form "${key}".`);
                continue;
            }

			const validationMode = tokens[1] === undefined
				? "sequential"
				: tokens[1];

            if (
				validationMode !== "sequential" &&
				validationMode !== "parallel"
			) {
				console.warn(`[@form] Unknown validation mode "${validationMode}".`);
				continue;
			}

            const entry = {
				validationMode,

                controller: {
                    valid: true,
					validating: false,
                    dirty: false,
                    touched: false,
                    submitting: false,
                    submitted: false,

					/**
					 * Field validation errors keyed by field name.
					 *
					 * Example:
					 * {
					 *   email: "Email is required.",
					 *   password: "Password is too short."
					 * }
					 */
					errors: Object.create(null),

					get validationMode() {
						return entry.validationMode;
					},
                },

				wasReset: false,
				pendingValidations: 0,
                validators: [],
                fields: [],
                fieldsByName: Object.create(null),
				registered: new WeakSet(),
            };

            const getFieldValue = (field) => {
                const type = field.type;
                const tagName = field.tagName;

                if (type === "checkbox") return field.checked;
                if (type === "radio") return field.checked ? field.value : null;
                return field.value;
            };

            const getFieldStates = (name) => {
                const value = entry.fieldsByName[name];
                if (value === undefined) {
                    return [];
                }
                return Array.isArray(value) ? value : [value];
            };

            const normalizeField = (fieldState) => ({
                element: fieldState.element,
                value: getFieldValue(fieldState.element),
				validating: fieldState.validating,
                touched: fieldState.touched,
                dirty: fieldState.dirty,
                initialValue: fieldState.initialValue,
                name: fieldState.name || fieldState.element.name,
                type: fieldState.element.type,
            });

            const getFieldEventName = (element) => {
                const type = element.type;
                const tagName = element.tagName;
                return type === "checkbox" || type === "radio" || tagName === "SELECT"
                    ? "change"
                    : "input";
            };

            const recalculateControllerState = () => {
                const controller = entry.controller;

                let formTouched = false;
                let formDirty = false;

                for (let k = 0, len = entry.fields.length; k < len; k++) {
                    const field = entry.fields[k];

                    if (field.touched) {
                        formTouched = true;
                    }

                    if (field.dirty) {
                        formDirty = true;
                    }

                    if (formTouched && formDirty) {
                        break;
                    }
                }

                if (
                    controller.touched !== formTouched ||
                    controller.dirty !== formDirty
                ) {
                    controller.touched = formTouched;
                    controller.dirty = formDirty;
                    touch(contextOwner, "ud");
                }
            };

            entry.controller.reset = ({ clearForm = true } = {}) => {
				if (clearForm && typeof elem.reset === "function") {
					elem.reset();
				}

				const controller = entry.controller;
				controller.valid = true;
				controller.dirty = false;
				controller.touched = false;
				controller.submitting = false;
				controller.submitted = false;
				controller.validating = false;

				const errors = controller.errors;
				for (const key in errors) {
					errors[key] = "";
				}

				updateFormValidity(entry);

				for (let k = 0, len = entry.fields.length; k < len; k++) {
					const field = entry.fields[k];

					field.touched = false;
					field.dirty = false;
					field.validating = false;
					field.initialValue = getFieldValue(field.element);
				}

				entry.wasReset = true;
				touch(contextOwner, "ud");
			};

            entry.controller.getField = (name) => {
                const states = getFieldStates(name);
                if (states.length === 0) {
                    return undefined;
                }
                if (states.length === 1) {
                    return normalizeField(states[0]);
                }
                return states.map(normalizeField);
            };

			entry.controller.getValue = (name) => {
				const states = getFieldStates(name);
				if (states.length === 0) {
					return undefined;
				}
				return states[0].value;
			};

			/**
			 * Sets a validation error for a field.
			 *
			 * @param {string} name
			 * Field name.
			 * @param {string} message
			 * Error message.
			 *
			 * @returns {boolean}
			 * Returns `true` if the error changed.
			 */
			entry.controller.setError = (name, message) => {
				if (!name) {
					return false;
				}

				message = typeof message === "string"
					? message.trim()
					: "";

				const errors = entry.controller.errors;

				if (errors[name] === message) {
					return false;
				}

				errors[name] = message;

				updateFormValidity(entry);
				touch(contextOwner, "ud");

				return true;
			};

			/**
			 * Clears the validation error for a field.
			 *
			 * @param {string} name
			 * Field name.
			 *
			 * @returns {boolean}
			 * Returns `true` if the error changed.
			 */
			entry.controller.resetError = (name) => {
				if (!name) {
					return false;
				}

				const errors = entry.controller.errors;

				if (!(name in errors)) {
					return false;
				}

				if (errors[name] === "") {
					return false;
				}

				errors[name] = "";

				updateFormValidity(entry);
				touch(contextOwner, "ud");

				return true;
			};

            entry.controller.setValue = (name, value) => {
                const states = getFieldStates(name);
                if (states.length === 0) {
                    return false;
                }

                for (let k = 0, len = states.length; k < len; k++) {
                    const fieldState = states[k];
                    const input = fieldState.element;
                    const type = input.type;

                    if (type === "checkbox") {
                        if (Array.isArray(value)) {
                            input.checked = value.includes(input.value);

                        } else if (typeof value === "boolean") {
                            input.checked = value;

                        } else {
                            input.checked = String(input.value) === String(value);
                        }

                    } else if (type === "radio") {
                        input.checked = String(input.value) === String(value);

                    } else {
                        input.value = value == null ? "" : String(value);
                    }

                    const eventName = getFieldEventName(input);
                    input.dispatchEvent(new Event(eventName, { bubbles: true }));
                }

                recalculateControllerState();
                return true;
            };

            entry.controller.resetField = (name, { clearField = true } = {}) => {
                const states = getFieldStates(name);
                if (states.length === 0) {
                    return false;
                }

                for (let k = 0, len = states.length; k < len; k++) {
                    const fieldState = states[k];
                    const input = fieldState.element;
                    const type = input.type;

                    if (clearField) {
                        if (type === "checkbox" || type === "radio") {
                            input.checked = false;
                        } else {
                            input.value = "";
                        }
                    }

                    fieldState.touched = false;
                    fieldState.dirty = false;
                    fieldState.initialValue = getFieldValue(input);
                }

				entry.controller.resetError(name);
				recalculateControllerState();

				return true;
            };

            forms[key] = entry.controller;
            formValidators.set(elem, entry);

			// Notify reactive system of new form registration
			touch(contextOwner, "ud");

            cleanups.push(() => {
                delete forms[key];
                formValidators.delete(elem);
            });

            elem.removeAttribute("@form");

        } catch (err) {
            console.warn("[@form] Invalid directive:", err);
        }
    }
}

/**
 * Processes `@submit` directives.
 *
 * The directive may only be used on `<form>` elements that also declare
 * an `@form` directive.
 *
 * Before invoking the submit handler, all validators registered through
 * `@validate` are executed according to the form's validation mode:
 *
 * - `sequential` (default):
 *   Validators run one after another and submission stops immediately
 *   when the first validation fails. The first invalid field receives
 *   focus.
 *
 * - `parallel`:
 *   All validators run concurrently. Submission waits for every
 *   validation to complete before determining validity. If one or more
 *   validations fail, the first invalid field receives focus.
 *
 * Form and field validation state (`validating`) is managed by the
 * validation system itself and may remain `true` while asynchronous
 * validators are still pending.
 *
 * Supported expressions:
 *
 *   @submit="login"
 *   @submit="login:user.id"
 *   @submit="login:user.id:remember"
 *
 * Submit handlers must resolve to a top-level function on the component
 * context. Nested member expressions such as:
 *
 *   @submit="user.login"
 *
 * are not supported.
 *
 * Function arguments may be arbitrary expressions and are evaluated
 * through `vm.evaluate()` immediately before the handler is invoked.
 *
 * Submit handlers may be synchronous or asynchronous. The form
 * controller's `submitting` state remains `true` until the handler
 * completes or throws.
 *
 * The `submitted` flag is set only after successful validation and
 * successful completion of the submit handler. If the submit handler
 * calls `controller.reset()`, its state changes are preserved and not
 * overwritten by the submission lifecycle.
 *
 * The first argument passed to every submit handler is:
 *
 * {
 *     event,
 *     form,
 *     formData,
 *     controller
 * }
 *
 * Remaining arguments are the evaluated directive arguments.
 *
 * @param {HTMLFormElement[]} nodes - Form elements containing `@submit`.
 * @param {Object} vm - Virtual machine instance used for expression evaluation.
 * @param {Object} context - Current runtime evaluation context.
 * @param {Object} scope - Active effect scope used for cleanup registration.
 * @returns {void}
 */
function processSubmitDirective(nodes, vm, context, scope) {
    const cleanups = scope.cleanups;
	const contextOwner = resolveContextOwner(context, "ud");

    for (let i = 0, nodesLength = nodes.length; i < nodesLength; i++) {

        const elem = nodes[i];
        const directive = elem.getAttribute("@submit");

        if (!directive) {
            continue;
        }

        try {
            if (elem.tagName !== "FORM") {
                console.warn(
                    "[@submit] Directive can only be used on <form> elements."
                );
                continue;
            }

            if (isQuotedString(directive)) {
                console.warn(
                    `[@submit] Invalid directive "${directive}". ` +
                    "Expected an expression, not a string literal."
                );
                continue;
            }

            const entry = formValidators.get(elem);

            if (entry === undefined) {
                console.warn(
                    "[@submit] The parent form must also have an @form directive."
                );
                continue;
            }

            const instructions = getOrCompileInstructions(
                "submit=" + normalizeDirective(directive)
            );

            const submitExpr = instructions[0].expr;

            let submitFn;
            let exprArgs;

            switch (submitExpr.type) {
                case EXPR_PATH: {
                    if (submitExpr.segments.length !== 1) {
                        console.warn(
                            `[@submit] "${submitExpr.key}" is not a valid submit handler. ` +
                            "Submit handlers do not support nested paths."
                        );
                        continue;
                    }

                    submitFn = resolveContextValue(
						context,
						submitExpr.key,
					);
                    break;
                }

                case EXPR_CALL: {
                    submitFn = resolveContextValue(
						context,
						submitExpr.name,
					);
                    exprArgs = submitExpr.args;
                    break;
                }

                default:
                    console.warn(
                        "[@submit] Unsupported submit expression."
                    );
                    continue;
            }

            if (typeof submitFn !== "function") {
                console.warn(
                    `[@submit] Submit handler "${
                        submitExpr.name ?? submitExpr.key
                    }" does not exist or is not a function.`
                );
                continue;
            }

            const controller = entry.controller;
			const validationMode = entry.validationMode;
            const validators = entry.validators;

            const handleSubmit = async (event) => {
				event.preventDefault();

				if (controller.submitting) {
					return;
				}

				controller.submitting = true;
				touch(contextOwner, "ud");

				let valid = true;
				let firstInvalid = null;

				try {
					if (validationMode === "parallel") {
						const results = await Promise.all(
							validators.map((validator) =>
								validator.validate("submit")
							)
						);

						for (
							let i = 0, length = results.length; 
							i < length; 
							i++
						) {
							if (!results[i]) {
								valid = false;

								if (firstInvalid === null) {
									firstInvalid = validators[i];
								}
							}
						}

					} else { // sequential
						for (
							let i = 0, length = validators.length;
							i < length;
							i++
						) {
							const validator = validators[i];

							if (!(await validator.validate("submit"))) {
								valid = false;
								firstInvalid = validator;

								// Sequential mode stops immediately.
								break;
							}
						}
					}

					controller.valid = valid;
					touch(contextOwner, "ud");

					if (!valid) {
						if (firstInvalid !== null) {
							firstInvalid.element.focus();
						}

						return;
					}

					const submitContext = {
						event,
						form: elem,
						formData: new FormData(elem),
						controller,
					};

					let args;

					if (exprArgs !== undefined) {
						const length = exprArgs.length;

						if (length > 0) {
							args = new Array(length);

							for (let i = 0; i < length; i++) {
								args[i] = vm.evaluate(
									exprArgs[i],
									context
								);
							}
						}
					}

					//----------------------------------------------------------
					// Invoke submit handler
					//----------------------------------------------------------

					if (args === undefined) {
						await submitFn(submitContext);

					} else {
						switch (args.length) {
							case 1:
								await submitFn(submitContext, args[0]);
								break;

							case 2:
								await submitFn(submitContext, args[0], args[1]);
								break;

							case 3:
								await submitFn(submitContext, args[0], args[1], args[2]);
								break;

							default:
								await submitFn(submitContext, ...args);
						}
					}

					// Submission succeeded. Don't overwrite a reset() call.
					if (!entry.wasReset) {
						controller.submitted = true;
					}

				} catch (err) {
					console.warn(`[@submit] Error evaluating "${directive}":`, err);

				} finally {
					controller.submitting = false;
					entry.wasReset = false;
					touch(contextOwner, "ud");
				}
			};

            elem.addEventListener("submit", handleSubmit);

            cleanups.push(() => {
                elem.removeEventListener("submit", handleSubmit);
            });

            elem.removeAttribute("@submit");

        } catch (err) {
            console.warn("[@submit] Invalid directive:", err);
        }
    }
}

/**
 * Removes ignored directives from the root element of an `@for` template.
 *
 * The element that declares `@for` acts as a template definition rather than a
 * bound element. Any remaining directive on the template element is ignored,
 * removed, and a warning is emitted.
 *
 * This function only inspects the template element itself. Descendant
 * directives are intentionally preserved and will be processed after the
 * template is cloned.
 *
 * @param {HTMLElement} template - The cloned `@for` template element.
 * @returns {void}
 */
function removeIgnoredDirectives(template) {
	const attributes = template.attributes;

	for (let i = attributes.length - 1; i >= 0; i--) {
		const { name } = attributes[i];

		if (!name.startsWith("@")) {
			continue;
		}

		console.warn(
			`[@for] Ignoring "${name}" on the template element. ` +
			"Move this directive inside the repeated content."
		);

		template.removeAttribute(name);
	}
}

/**
 * Processes `@for` directives by rendering an iterable collection using a
 * template element.
 *
 * Supported syntax:
 *
 *   - `@for="item items"`
 *   - `@for="item index items"`
 *
 * Where:
 *   - `item` is a single-segment variable name available inside the loop.
 *   - `index` is an optional single-segment variable name.
 *   - `items` can be any valid Udodi expression that evaluates to an array.
 *
 * The optional `@key` directive is evaluated against each iteration context
 * to provide stable identity during reconciliation.
 *
 * @param {HTMLElement[]} nodes - Elements containing `@for` directives.
 * @param {Object} vm - Virtual machine instance.
 * @param {Object} context - Parent evaluation context.
 * @param {Object} scope - Parent reactive scope.
 * @returns {void}
 */
function processForDirective(nodes, vm, context, scope) {
	const cleanups = scope.cleanups;

    for (let i = 0, nodesLength = nodes.length; i < nodesLength; i++) {
        const templateEl = nodes[i];
        const directive = templateEl.getAttribute("@for");

        if (!directive) {
            continue;
        }

		try {
			if (isQuotedString(directive)) {
				throw new Error(
					"[@for] Expression must evaluate to an iterable, not a string literal."
				);
			}

			//------------------------------------------------------------------
			// Normalize and compile
			//------------------------------------------------------------------

			const tokens = normalizeDirective(directive).split(" ");

			if (tokens.length < 2 || tokens.length > 3) {
				throw new Error(
					'[@for] Expected "@for=\\"item items\\"" or "@for=\\"item index items\\"".'
				);
			}

			const instructions = getOrCompileInstructions(
				"for=" + tokens.join(" for=")
			);

			//------------------------------------------------------------------
			// Collect OP_EVAL instructions
			//------------------------------------------------------------------

			const ITEM_OP_EVAL = 0;
			const INDEX_OP_EVAL = 2;
			const ITERABLE_OP_EVAL = instructions.length - 2;

			const itemExpr = instructions[ITEM_OP_EVAL].expr;
			const indexExpr = 
				tokens.length === 3
					? instructions[INDEX_OP_EVAL].expr
					: null;

			const iterableExpr = instructions[ITERABLE_OP_EVAL].expr;

			//------------------------------------------------------------------
			// Validate item variable
			//------------------------------------------------------------------

			if (
				itemExpr.type !== EXPR_PATH ||
				itemExpr.segments.length !== 1
			) {
				throw new Error(
					"[@for] Item variable must be a single identifier."
				);
			}

			//------------------------------------------------------------------
			// Validate index variable
			//------------------------------------------------------------------

			if (
				indexExpr &&
				(
					indexExpr.type !== EXPR_PATH ||
					indexExpr.segments.length !== 1
				)
			) {
				throw new Error(
					"[@for] Index variable must be a single identifier."
				);
			}

			//------------------------------------------------------------------
			// Validate iterable expression
			//------------------------------------------------------------------

			if (iterableExpr.type === EXPR_LITERAL) {
				throw new Error(
					"[@for] Iterable expression cannot be a string literal."
				);
			}

			const itemVar = itemExpr.segments[0];
			const indexVar = indexExpr === null
				? null
				: indexExpr.segments[0];

			//------------------------------------------------------------------
			// Compile optional @key
			//------------------------------------------------------------------

			let keyExpression = null;
			const rawKey = templateEl.getAttribute("@key");

			if (rawKey !== null) {
				const keyExpr = rawKey.trim();

				if (keyExpr === "") {
					throw new Error(
						"[@key] Expression cannot be empty."
					);
				}

				const keyInstructions = getOrCompileInstructions(
					"key=" + normalizeDirective(keyExpr)
				);

				const instruction = keyInstructions[0];

				if (instruction.expr.type !== EXPR_PATH) {
					throw new Error(
						"[@key] Expression must be a valid path."
					);
				}

				keyExpression = instruction.expr;
			}

			//------------------------------------------------------------------
			// Prepare template
			//------------------------------------------------------------------

			const container = templateEl.parentNode;

			if (!container) {
				continue;
			}

			const template = templateEl.cloneNode(true);

			template.removeAttribute("@for");
			template.removeAttribute("@key");

			removeIgnoredDirectives(template);

			const anchor = document.createComment("@for");

			container.replaceChild(anchor, templateEl);

			//------------------------------------------------------------------
			// Reconciliation state
			//------------------------------------------------------------------

			const rendered = new Map();
			const warnedObjects = new WeakSet();

			/**
			 * Generates a fallback key when no @key directive is provided.
			 *
			 * Objects attempt to use one of the common stable identifiers:
			 *   - id
			 *   - _id
			 *   - key
			 *
			 * If none exist, the current index is used as a last resort and a
			 * warning is emitted only once for that object instance.
			 *
			 * Primitive values are combined with their type and index to
			 * minimize collisions.
			 *
			 * @param {*} item - Current item.
			 * @param {number} index - Current array index.
			 * @returns {string}
			 */
			const getFallbackKey = (item, index) => {
				if (typeof item === "object" && item !== null) {
					if (item.id != null) {
						return `id:${item.id}`;
					}

					if (item._id != null) {
						return `_id:${item._id}`;
					}

					if (item.key != null) {
						return `key:${item.key}`;
					}

					if (!warnedObjects.has(item)) {
						console.warn(
							`[@for] Item has no stable key. Consider adding @key="item.id".`
						);

						warnedObjects.add(item);
					}
				}

				return `${typeof item}:${String(item)}:${index}`;
			};

			/**
			 * Cleans up a rendered record without necessarily removing its
			 * element from the DOM.
			 *
			 * @param {Object} record
			 * @returns {void}
			 */
			const cleanupRecord = (record) => {
				if (!record || record.destroyed) {
					return;
				}

				record.destroyed = true;
				runScopeCleanup(record.scope, "[@for]");
				unregisterRoot(record.el);
			};

			/**
			 * Completely unmounts a rendered record.
			 *
			 * This performs cleanup and removes the element from the DOM.
			 *
			 * @param {Object} record
			 * @returns {void}
			 */
			const unmountRecord = (record) => {
				if (!record || record.destroyed) {
					return;
				}

				cleanupRecord(record);

				if (record.el.isConnected) {
					record.el.remove();
				}
			};

			//------------------------------------------------------------------
			// Reactive reconciliation
			//------------------------------------------------------------------

			const dispose = effect(() => {

				// Evaluate iterable using the compiled expression.
				const array = vm.evaluate(iterableExpr, context);

				if (!Array.isArray(array)) {
					rendered.forEach(unmountRecord);
					rendered.clear();
					return;
				}

				const nextKeySet = new Set();
				const nextRendered = new Map();

				let prevNode = anchor;

				for (let index = 0; index < array.length; index++) {
					const item = array[index];

					let key;

					if (keyExpression === null) {
						key = getFallbackKey(item, index);

					} else {
						const itemContext = {};

						itemContext[itemVar] = item;

						if (indexVar !== null) {
							itemContext[indexVar] = index;
						}

						key = vm.evaluate(keyExpression, itemContext);
					}

					if (key == null) {
						console.warn(
							`[@for] Invalid key for item at index ${index}.`
						);

						continue;
					}

					if (nextKeySet.has(key)) {
						console.warn(
							`[@for] Duplicate key "${String(key)}".`
						);

						continue;
					}

					nextKeySet.add(key);

					//------------------------------------------------------------------
					// Attempt to reuse existing record
					//------------------------------------------------------------------

					let record = rendered.get(key);

					if (record && record.destroyed) {
						rendered.delete(key);
						record = undefined;
					}

					//------------------------------------------------------------------
					// Create new record if necessary
					//------------------------------------------------------------------

					if (record === undefined) {

						const el = template.cloneNode(true);

						const itemScope = {
							effects: [],
							cleanups: [],
							_root: el,
						};

						const bindingContext = createChildContext(context);

						// Create reactive signals for the current item and index.
						const [getItem, setItem] = createSignal(item);
						bindingContext[itemVar] = getItem;

						let setIndex = null;

						if (indexVar) {
							const [getIndex, setter] = createSignal(index);

							bindingContext[indexVar] = getIndex;
							setIndex = setter;
						}

						record = {
							el,
							scope: itemScope,
							setItem,
							setIndex,
							destroyed: false,
						};

						//----------------------------------------------------------
						// Bind cloned subtree
						//----------------------------------------------------------

						try {
							// Resolve directives inside the cloned subtree.
							const directives = extractAllDirectives(el);

							// Bind the subtree using the current iteration context.
							bindDOM(
								directives,
								vm,
								bindingContext,
								itemScope,
							);

							// Register lifecycle handlers so detached items
							// participate in automatic cleanup.
							registerRoot(
								el,
								() => cleanupRecord(record),
								() => unmountRecord(record),
							);

						} catch (err) {
							runScopeCleanup(itemScope, "[@for]");
							throw err;
						}

					} else {

						//------------------------------------------------------------------
						// Update existing signals
						//------------------------------------------------------------------

						record.setItem(item);

						if (record.setIndex !== null) {
							record.setIndex(index);
						}
					}

					nextRendered.set(key, record);

					const nextSibling = prevNode.nextSibling;

					if (record.el !== nextSibling) {
						container.insertBefore(record.el, nextSibling);
					}

					prevNode = record.el;
				}

				//--------------------------------------------------------------
				// Remove stale records
				//--------------------------------------------------------------

				for (const [key, record] of rendered) {
					if (!nextKeySet.has(key)) {
						unmountRecord(record);
					}
				}

				rendered.clear();

				for (const [key, record] of nextRendered) {
					rendered.set(key, record);
				}

			}, scope);

			//--------------------------------------------------------------
			// Parent scope cleanup
			//--------------------------------------------------------------

			cleanups.push(() => {
				dispose();

				for (const record of rendered.values()) {
					unmountRecord(record);
				}

				rendered.clear();

				if (anchor.isConnected) {
					anchor.remove();
				}
			});

		} catch (err) {
			console.warn("[@for]", err);
		}
	}
}

/**
 * Processes the `@teleport` directive.
 *
 * Moves an element from its current location to another DOM target.
 *
 * Supported syntax:
 *
 * ```html
 * <div @teleport="#modal-root">Modal</div>
 * <div @teleport="overlay">Overlay</div>
 * ```
 *
 * Special targets:
 *
 * - `overlay` --> `#udodi-overlay-root`
 *
 * A placeholder comment is left in the original location so the
 * framework can keep track of the element's previous position and
 * perform proper cleanup when the component is destroyed.
 *
 * Cleanup removes:
 * - the placeholder comment
 * - the teleported element (if still connected)
 * - the internal teleport registration
 *
 * @param {HTMLElement[]} nodes
 *   Elements containing the `@teleport` directive.
 * @param {{
 *   cleanups: Function[]
 * }} scope
 *   Current component scope.
 *
 * @returns {void}
 */
function processTeleportDirective(nodes, scope) {
	const cleanups = scope.cleanups;

	for (let i = 0, nodesLength = nodes.length; i < nodesLength; i++) {
		const elem = nodes[i];
		const selector = elem.getAttribute("@teleport").trim();

		if (!selector) continue;

		try {
			let target;

			if (selector === "overlay") {
				target = ensureOverlayRoot();

			} else {
				target = document.querySelector(selector);
			}

			if (!target) {
				console.warn(`[@teleport] Target not found: ${selector}`);
				continue;
			}

			// Prevent duplicate teleport registration.
			if (teleportMap.has(elem)) {
				continue;
			}

			const parent = elem.parentNode;

			if (!parent) {
				continue;
			}

			const placeholder = document.createComment("@teleport");
			parent.insertBefore(placeholder, elem);

			teleportMap.set(elem, { placeholder });
			target.appendChild(elem);

			cleanups.push(() => {
				const state = teleportMap.get(elem);

				if (!state) {
					return;
				}

				if (state.placeholder.isConnected) {
					state.placeholder.remove();
				}

				if (elem.isConnected) {
					elem.remove();
				}

				teleportMap.delete(elem);
			});

			elem.removeAttribute("@teleport");

		} catch (err) {
			console.warn("[@teleport] Invalid directive:", err);
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
	processBindDirective(directives.bind, vm, context, scope);
	processTextDirective(directives.text, vm, context, scope);
	processClassDirective(directives.class, vm, context, scope);
	processStyleDirective(directives.style, vm, context, scope);
	processAttrDirective(directives.attr, vm, context, scope);

	processFormDirective(directives.form, vm, context, scope);
	processValidateDirective(directives.validate, vm, context, scope);
	processSubmitDirective(directives.submit, vm, context, scope);

	processShowDirective(directives.show, vm, context, scope);
	processForDirective(directives.for, vm, context, scope);

	processIfDirective(directives.if, vm, context, scope);
	processElseIfDirective(directives.elseif);
    processElseDirective(directives.else);

	processTeleportDirective(directives.teleport, scope);
}
