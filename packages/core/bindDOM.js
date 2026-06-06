import { queueBinding, scheduleFlush } from "./bindingQueue.js";
import { createSignal, effect } from "../reactivity/index.js";
import { extractAllDirectives, DIRECTIVE_ATTRIBUTES } from "./directive.js";
import {
 registerRoot,
 unregisterRoot,
	runScopeCleanup,
} from "./lifecycle.js";
import {
	isQuote,
	splitBindingsBySpace,
	splitUnquoted,
	splitFirstUnquoted,
	isQuotedString,
	unquoteString,
	classifyToken,
	tokenFrom,
	parseResolver,
} from "./tokenizer.js";

const NON_DELEGATED_EVENTS = new Set([
	"wheel",
	"scroll",
	"touchstart",
	"touchmove",
	"touchend",
	"mouseenter",
	"mouseleave",
	"pointerenter",
	"pointerleave",
]);

const KEY_MODIFIERS = {
	enter: "Enter",
	esc: "Escape",
	space: " ",
	tab: "Tab",
};

const teleportMap = new WeakMap();

function unwrap(value) {
	return typeof value === "function" ? value() : value;
}

function removeDirectiveAttributes(el) {
	if (!el.hasAttributes()) return;

	const length = DIRECTIVE_ATTRIBUTES.length;

	for (let i = 0; i < length; i++) {
		const attr = DIRECTIVE_ATTRIBUTES[i];
		if (el.hasAttribute(attr)) {
			el.removeAttribute(attr);
		}
	}
}

/**
 * Reads a nested path from context safely.
 * @param {Object} context - Object to traverse.
 * @param {string} path - Dot-separated path like "user.name.firstName".
 * @returns {any} Value at path or undefined if not found.
 */
function readPath(context, path) {
	const classified = classifyToken(path);
	if (classified.type !== "path") return undefined;

	const parts = classified.value.split(".");
	let value = context;

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (value === null || value === undefined) return undefined;

		value = value[part];

		// Only unwrap on the final segment
		if (i === parts.length - 1) {
			value = unwrap(value);
		}
	}

	return value;
}

/**
 * Checks if a nested path exists in context.
 * @param {Object} context - Object to traverse.
 * @param {string} path - Dot-separated path like "user.name".
 * @returns {boolean} True if path exists and is not null or undefined at each step.
 */
function hasPath(context, path) {
	const classified = classifyToken(path);
	if (classified.type !== "path") return false;

	const parts = classified.value.split(".");
	let value = context;

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (value === null || value === undefined) return false;

		value = value[part];

		if (i === parts.length - 1) {
			value = unwrap(value);
		}
	}

	return value !== undefined && value !== null;
}

/**
 * Updates a nested path in context by replacing the root object.
 * Immutable update: replaces root-level keys only.
 * @param {Object} context - Object to update.
 * @param {string} path - Dot-separated path.
 * @param {any} nextValue - Value to set.
 * @returns {boolean} True if update succeeded, false if root path is invalid.
 */
function setPath(context, path, nextValue) {
	const parts = path.trim().split(".");
	if (parts.length === 1) {
		context[parts[0]] = nextValue;
		return true;
	}

	const rootKey = parts[0];
	const rootValue = unwrap(readPath(context, rootKey));
	if (rootValue === null || typeof rootValue !== "object") return false;

	const rootCopy = Array.isArray(rootValue)
		? rootValue.slice()
		: { ...rootValue };
	let cursor = rootCopy;

	for (let i = 1; i < parts.length - 1; i++) {
		const part = parts[i];
		const current = cursor[part];
		const next =
			current && typeof current === "object"
				? Array.isArray(current)
					? current.slice()
					: { ...current }
				: {};

		cursor[part] = next;
		cursor = next;
	}

	cursor[parts[parts.length - 1]] = nextValue;
	context[rootKey] = rootCopy;
	return true;
}

/**
 * Resolves a token value from context.
 * Quoted tokens return their literal value.
 * Path tokens are looked up in context.
 * @param {Object} context - Context object.
 * @param {Object} token - Token from tokenFrom().
 * @returns {any} Resolved value or undefined.
 */
function resolveToken(context, token) {
	if (!token) return undefined;
	if (token.quoted) return token.value;

	const classified = classifyToken(token.value);
	if (classified.type !== "path") return undefined;

	return unwrap(readPath(context, classified.value));
}

/**
 * Creates a getter function for directive expressions.
 * Supports quoted strings, dot-paths, and resolver:arg1:arg2 syntax.
 * @param {Object} context - Evaluation context.
 * @param {string} expr - Directive expression to evaluate.
 * @returns {Function} () => any Getter function that returns the evaluated expression.
 */
function createGetter(context, expr) {
	const source = expr?.trim();

	if (!source) return () => undefined;

	if (isQuotedString(source)) {
		const literal = unquoteString(source);
		return () => literal;
	}

	const resolverInfo = parseResolver(source);

	if (resolverInfo) {
		let warnedNonFunction = false;

		return () => {
			const resolverFn = readPath(context, resolverInfo.resolver);

			if (typeof resolverFn !== "function") {
				if (hasPath(context, resolverInfo.resolver) && !warnedNonFunction) {
					console.warn(
						`[Resolver] "${resolverInfo.resolver}" resolved to a non-function value`,
					);
					warnedNonFunction = true;
				}

				return undefined;
			}

			try {
				return resolverFn(
					...resolverInfo.args.map((arg) => resolveToken(context, arg)),
				);
			} catch (err) {
				console.warn(`[Resolver] Error calling "${resolverInfo.resolver}":`, err);
				return "";
			}
		};
	}

	return () => unwrap(readPath(context, source));
}

/**
 * Creates a bidirectional binding model for @bind directives.
 * Supports path updates and read-only resolver-based bindings.
 * @param {Object} context - Binding context.
 * @param {string} expr - Path or resolver expression.
 * @returns {Object} { get: Function, set: Function } model object.
 */
function createModel(context, expr) {
	const resolverInfo = parseResolver(expr);

	if (resolverInfo) {
		const get = createGetter(context, expr);
		return {
			get,
			set() {
				console.warn("[@bind] Resolver-based binding does not support setting");
			},
		};
	}

	return {
		get: createGetter(context, expr),
		set(value) {
			if (!setPath(context, expr, value)) {
				console.warn(`[@bind] Cannot update "${expr}"`);
			}
		},
	};
}


/**
 * Parses @for directive expression: "item arrayItems" or "item index arrayItems".
 * @param {string} expr - @for expression.
 * @returns {Object} { itemVar, indexVar, arrayKey } parsed components.
 * @throws {Error} If expression format is invalid.
 */
function parseForExpression(expr) {
	const parts = splitBindingsBySpace(expr);
	const len = parts.length;

	if (!(len === 2 || len === 3)) {
		throw new Error(
			`Invalid @for expression: ${expr}. Expected "item arrayItem" or "item index arrayItem"`
		);
	}

	const isIdentifier = (value) => /^[A-Za-z_$][\w$]*$/.test(value);

	const itemVar = parts[0];
	const indexVar = len === 3 ? parts[1] : null;
	const arrayKey = parts[len - 1];

	if (!isIdentifier(itemVar)) {
		throw new Error(`Invalid @for item variable: ${itemVar}`);
	}

	if (indexVar && !isIdentifier(indexVar)) {
		throw new Error(`Invalid @for index variable: ${indexVar}`);
	}

	let colonIndex = arrayKey.indexOf(":");
	const baseArrayKey =
		colonIndex === -1
			? arrayKey
			: arrayKey.slice(0, colonIndex);

	if (!isIdentifier(baseArrayKey)) {
		throw new Error(`Invalid @for array key: ${arrayKey}`);
	}

	return {
		itemVar,
		indexVar,
		arrayKey,
	};
}

/**
 * Processes @for directives with shared binding queue: renders arrays with optional @key for stable identity.
 * Keys are preserved across re-renders; missing/invalid keys are warned.
 * @param {HTMLElement[]} nodes - Template elements with @for.
 * @param {Object} context - Parent context.
 * @param {Object} scope - Effect scope.
 */
function processForDirective(nodes, context, scope) {
	nodes.forEach((templateEl) => {
		const expr = templateEl.getAttribute("@for")?.trim();
		if (!expr) return;

		try {
			const { itemVar, indexVar, arrayKey } = parseForExpression(expr);
			const arrayGetter = createGetter(context, arrayKey);
			const container = templateEl.parentNode;
			if (!container) return;

			const template = templateEl.cloneNode(true);
			const keyExpr = template.getAttribute("@key")?.trim();

			template.removeAttribute("@for");
			template.removeAttribute("@key");
			removeDirectiveAttributes(template);

			const anchor = document.createComment(`@for:${arrayKey}`);
			container.replaceChild(anchor, templateEl);

			const rendered = new Map();
			const warnedObjects = new WeakSet();

			const getFallbackKey = (item, index) => {
				if (item == null) return `null:${index}`;

				if (typeof item === "object") {
					if (item.id != null) return `id:${item.id}`;
					if (item._id != null) return `_id:${item._id}`;
					if (item.key != null) return `key:${item.key}`;

					// Warn about unstable object keys only once per object
					if (!warnedObjects.has(item)) {
						console.warn(`[@for] Object at index ${index} has no stable key (id/_id/key).`);
						warnedObjects.add(item);
					}

					return `idx:${index}`;
				}

				return `${typeof item}:${String(item)}:${index}`;
			};

			const cleanupRecord = (record) => {
				if (!record || record.destroyed) return;
				
				record.destroyed = true;
				runScopeCleanup(record.scope, "[@for]");

				if (record.el.isConnected) {
					record.el.remove();
				}

     unregisterRoot(record.el);
			};

			const dispose = effect(() => {
				const array = arrayGetter();
				if (!Array.isArray(array)) {
					rendered.forEach(cleanupRecord);
					rendered.clear();
					return;
				}

				const nextKeySet = new Set();
				const nextRendered = new Map();
				let prevNode = anchor;

				for (let index = 0; index < array.length; index++) {
					const item = array[index];

					const key = keyExpr
						? createGetter({ ...context, [itemVar]: item, ...(indexVar && { [indexVar]: index }) }, keyExpr)()
						: getFallbackKey(item, index);

					if (key == null || nextKeySet.has(key)) {
						console.warn("[@for] Invalid or duplicate key:", key);
						continue;
					}

					nextKeySet.add(key);

					let record = rendered.get(key);
					if (record && record.destroyed) {
						rendered.delete(key);
						record = null;
					}

					if (!record) {
						const el = template.cloneNode(true);
						const [getItem, setItem] = createSignal(item);
						const [getIndex, setIndex] = createSignal(index);

						const itemScope = { effects: [], cleanups: [], _root: el };
						const itemContext = Object.create(context);

						itemContext[itemVar] = getItem;
						if (indexVar) itemContext[indexVar] = getIndex;

						record = {
							el,
							scope: itemScope,
							setItem,
							setIndex,
							destroyed: false,
						};

						// === QUEUE FOR DEFERRED BINDING ===
						queueBinding(el, itemContext, itemScope);

						const cleanup = () => cleanupRecord(record);
       registerRoot(el,cleanup,cleanup);
					} else {
						record.setItem(item);
						if (indexVar) record.setIndex(index);
					}

					nextRendered.set(key, record);
					const nextSibling = prevNode.nextSibling;

					if (record.el !== nextSibling) {
						container.insertBefore(record.el, nextSibling);
					}
					prevNode = record.el;
				}

				// Cleanup removed items
				for (const [key, record] of rendered) {
					if (!nextKeySet.has(key)) {
						cleanupRecord(record);
					}
				}

				rendered.clear();
				nextRendered.forEach((r, k) => rendered.set(k, r));

			}, scope);

			scope.cleanups.push(() => {
				dispose();
				rendered.forEach(cleanupRecord);
				rendered.clear();
				anchor.remove();
			});

		} catch (err) {
			console.warn("[@for] Error:", err);
		}
	});
}

/**
 * Processes @text directives: sets reactive textContent.
 * @param {HTMLElement[]} nodes - Elements with @text.
 * @param {Object} context - Evaluation context.
 * @param {Object} scope - Effect scope.
 */
function processTextDirective(nodes, context, scope) {
	nodes.forEach((el) => {
		const expr = el.getAttribute("@text")?.trim();
		if (!expr) return;

		try {
			if (isQuotedString(expr)) {
				el.textContent = unquoteString(expr);
				el.removeAttribute("@text");
				return;
			}

			if (isQuote(expr[0])) {
				console.warn(`[@text] Invalid quoted directive usage: ${expr}`);
				el.removeAttribute("@text");
				return;
			}

			const getter = createGetter(context, expr);
			const dispose = effect(() => {
				try {
					const value = getter();
					el.textContent = value == null ? "" : String(value);
				} catch (err) {
					console.warn(`[@text] Error evaluating "${expr}":`, err);
					el.textContent = "";
				}
			}, scope);

			scope.cleanups.push(dispose);
			el.removeAttribute("@text");
		} catch (err) {
			console.warn("[@text] Invalid directive:", err);
		}
	});
}

function parseEventBindings(binding) {
	const items = splitBindingsBySpace(binding);
	const result = [];

	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const parts = splitUnquoted(item, ":");
		if (parts.length < 2) continue;

		const eventPart = parts[0];
		const handlerExpr = parts[1];
		const handlerToken = classifyToken(handlerExpr);

		if (!eventPart || handlerToken.type !== "path") continue;

		const split = eventPart.split(".");
		const eventName = split[0]?.trim();
		if (!eventName || isQuotedString(eventName)) continue;

		const splitLength = split.length;
		const modifiers = new Array(splitLength - 1);
		for (let j = 1; j < splitLength; j++) {
			modifiers[j - 1] = split[j];
		}

		const partsLength = parts.length;
		const args = new Array(partsLength - 2);

		for (let k = 2; k < partsLength; k++) {
			args[k - 2] = tokenFrom(parts[k]);
		}

		result.push({
			eventName,
			modifiers,
			name: handlerToken.value,
			args,
		});
	}

	return result;
}

function eventListenerOptions(modifiers) {
	if (modifiers.includes("nonpassive") || modifiers.includes("prevent")) {
		return { passive: false };
	}

	return { passive: true };
}

/**
 * Parses and processes @on directives: event delegation with modifiers.
 * Supports modifiers: .prevent, .stop, .self, .enter, .esc, .space, .tab, .passive, .nonpassive
 * @param {HTMLElement[]} nodes - Elements with @on.
 * @param {Object} context - Handler context.
 * @param {Object} scope - Effect scope.
 */
function processEventDirective(nodes, context, scope) {
	if (!nodes.length) return;

	const eventMap = new Map();

	nodes.forEach((el) => {
		const binding = el.getAttribute("@on");
		if (!binding) return;

		try {
			const bindings = parseEventBindings(binding);
			if (bindings.length) eventMap.set(el, bindings);
		} catch (err) {
			console.warn("[@on] Invalid directive:", err);
		}
	});

	const executeBinding = ({ modifiers, name, args }, element, event) => {
		if (modifiers.includes("prevent")) event.preventDefault();
		if (modifiers.includes("stop")) event.stopPropagation();
		if (modifiers.includes("self") && event.target !== element) return;

		const keyMod = modifiers.find((modifier) => modifier in KEY_MODIFIERS);
		if (keyMod && event.key !== KEY_MODIFIERS[keyMod]) return;

		const handler = readPath(context, name);
		if (typeof handler !== "function") {
			console.warn(`[@on] Handler "${name}" is not a function`);
			return;
		}

		try {
			handler(event, ...args.map((arg) => resolveToken(context, arg)));
		} catch (err) {
			console.warn("[@on] Event handler error:", err);
		}
	};

	const root = scope._root || nodes[0].ownerDocument;
	const delegatedEvents = new Set();
	const directListeners = [];

	const handleDelegatedEvent = (event) => {
		let target = event.target;

		while (target) {
			const bindings = eventMap.get(target);
			if (bindings) {
				for (const binding of bindings) {
					if (
						binding.eventName === event.type &&
						!NON_DELEGATED_EVENTS.has(binding.eventName)
					) {
						executeBinding(binding, target, event);
					}
				}
			}

			if (target === root) break;
			target = target.parentElement;
		}
	};

	eventMap.forEach((bindings, el) => {
		bindings.forEach((binding) => {
			if (NON_DELEGATED_EVENTS.has(binding.eventName)) {
				const handler = (event) => executeBinding(binding, el, event);
				const options = eventListenerOptions(binding.modifiers);

				el.addEventListener(binding.eventName, handler, options);
				directListeners.push({
					el,
					eventName: binding.eventName,
					handler,
					options,
				});
				return;
			}

			if (!delegatedEvents.has(binding.eventName)) {
				delegatedEvents.add(binding.eventName);
				root.addEventListener(binding.eventName, handleDelegatedEvent, true);
			}
		});
	});

	scope.cleanups.push(() => {
		delegatedEvents.forEach((eventName) => {
			root.removeEventListener(eventName, handleDelegatedEvent, true);
		});

		directListeners.forEach(({ el, eventName, handler, options }) => {
			el.removeEventListener(eventName, handler, options);
		});
	});

	nodes.forEach((el) => el.removeAttribute("@on"));
}

function processIfDirective(nodes, context, scope) {
	nodes.forEach((el) => {
		const expr = el.getAttribute("@if")?.trim();
		if (!expr) return;

		try {
			const getter = createGetter(context, expr);
			const placeholder = document.createComment("@if");
			const parent = el.parentNode;
			if (!parent) return;

			parent.insertBefore(placeholder, el);
			let mounted = true;

			const dispose = effect(() => {
				let value = false;

				try {
					value = !!getter();
				} catch (err) {
					console.warn(`[@if] Error evaluating "${expr}":`, err);
				}

				if (value && !mounted) {
					parent.insertBefore(el, placeholder.nextSibling);
					mounted = true;
				} else if (!value && mounted) {
					parent.replaceChild(placeholder, el);
					mounted = false;
				}
			}, scope);

			scope.cleanups.push(dispose);
			scope.cleanups.push(() => {
				if (mounted) el.remove();
				placeholder.remove();
			});

			el.removeAttribute("@if");
		} catch (err) {
			console.warn("[@if] Invalid directive:", err);
		}
	});
}

function processShowDirective(nodes, context, scope) {
	nodes.forEach((el) => {
		const expr = el.getAttribute("@show")?.trim();
		if (!expr) return;

		try {
			const getter = createGetter(context, expr);
			const initialDisplay = el.style.display;
			const dispose = effect(() => {
				try {
					el.style.display = getter() ? initialDisplay : "none";
				} catch (err) {
					console.warn(`[@show] Error evaluating "${expr}":`, err);
					el.style.display = "none";
				}
			}, scope);

			scope.cleanups.push(dispose);
			el.removeAttribute("@show");
		} catch (err) {
			console.warn("[@show] Invalid directive:", err);
		}
	});
}

function processTeleportDirective(nodes, scope) {
	nodes.forEach((el) => {
		const selector = el.getAttribute("@teleport")?.trim();
		if (!selector) return;

		try {
			const target =
				selector === "overlay"
					? document.getElementById("udodi-overlay-root")
					: document.querySelector(selector);

			if (!target) {
				console.warn(`[@teleport] target not found: ${selector}`);
				return;
			}

			if (teleportMap.has(el)) return;

			const placeholder = document.createComment("teleport-anchor");
			const currentParent = el.parentNode;
			if (!currentParent) return;
			currentParent.insertBefore(placeholder, el);
			teleportMap.set(el, { placeholder });
			target.appendChild(el);

			scope.cleanups.push(() => {
				const state = teleportMap.get(el);
				if (!state) return;

				state.placeholder.remove();
				if (el.isConnected) el.remove();
				teleportMap.delete(el);
			});

			el.removeAttribute("@teleport");
		} catch (err) {
			console.warn("[@teleport] Invalid directive:", err);
		}
	});
}

function createClassListBinding(context, expr) {
	const getter = createGetter(context, expr);
	let previous = [];

	return {
		type: "classList",
		getter,
		apply(el) {
			const value = getter();
			let classes = [];

			if (typeof value === "string" && value.trim()) {
				classes = splitBindingsBySpace(value);
			} else if (Array.isArray(value)) {
				classes = value.flatMap((className) =>
					typeof className === "string" ? splitBindingsBySpace(className) : [],
				);
			} else if (value !== undefined && value !== null && value !== false) {
				console.warn(
					`[@class] Class source "${expr}" must return class name string(s)`,
				);
			}

			previous.forEach((className) => el.classList.remove(className));
			classes.forEach((className) => el.classList.add(className));
			previous = classes;
		},
	};
}

function parseClassBinding(context, item) {
	const parts = splitFirstUnquoted(item, ":");

	if (parts.length === 1) {
		return createClassListBinding(context, item);
	}

	const left = parts[0];
	const right = parts[1];
	const leftToken = classifyToken(left);

	if (leftToken.type !== "literal") {
		return createClassListBinding(context, item);
	}

	const classNames = splitBindingsBySpace(leftToken.value);
	const resolverInfo = parseResolver(right);

	if (!resolverInfo) {
		return {
			type: "conditional",
			classNames,
			getter: () => !!unwrap(readPath(context, right)),
		};
	}

	return {
		type: "conditional",
		classNames,
		getter: () => {
			const fn = readPath(context, resolverInfo.resolver);
			if (typeof fn !== "function") return false;

			try {
				const args = resolverInfo.args;
				const argsLength = args.length;
				const resolvedArgs = new Array(argsLength);

				for (let i = 0; i < argsLength; i++) {
					resolvedArgs[i] = resolveToken(context, args[i]);
				}

				return !!fn(...resolvedArgs);

			} catch (err) {
				console.warn(`[@class] Error calling "${resolverInfo.resolver}":`, err);
				return false;
			}
		},
	};
}

/**
 * Processes @class directives: class binding with conditional and list syntax.
 * Syntax: className:predicate or bare path for class list.
 * @param {HTMLElement[]} nodes - Elements with @class.
 * @param {Object} context - Evaluation context.
 * @param {Object} scope - Effect scope.
 */
function processClassDirective(nodes, context, scope) {
	nodes.forEach((el) => {
		const classBindings = el.getAttribute("@class");
		if (!classBindings) return;

		try {
			const bindings = splitBindingsBySpace(classBindings).map((item) =>
				parseClassBinding(context, item),
			);

			const dispose = effect(() => {
				bindings.forEach((binding) => {
					try {
						if (binding.type === "conditional") {
							const active = !!binding.getter();
							binding.classNames.forEach((cls) => {
								if (active) el.classList.add(cls);
								else el.classList.remove(cls);
							});
						} else if (binding.type === "classList") {
							binding.apply(el);
						}
					} catch (err) {
						console.warn("[@class] Error evaluating binding:", err);
					}
				});
			}, scope);

			scope.cleanups.push(dispose);
			el.removeAttribute("@class");
		} catch (err) {
			console.warn("[@class] Invalid directive:", err);
		}
	});
}

function processBindDirective(nodes, context, scope) {
	nodes.forEach((el) => {
		const expr = el.getAttribute("@bind")?.trim();
		if (!expr) return;

		try {
			const model = createModel(context, expr);
			const isCheckbox = el.type === "checkbox";
			const isRadio = el.type === "radio";

			const render = () => {
				const value = model.get();
				if (isCheckbox) {
					el.checked = Boolean(value);
				} else if (isRadio) {
					el.checked = el.value === String(value);
				} else if (el.value !== String(value ?? "")) {
					el.value = value ?? "";
				}
			};

			const handleInput = () => {
				if (isCheckbox) {
					model.set(el.checked);
				} else if (isRadio) {
					if (el.checked) model.set(el.value);
				} else {
					model.set(el.value);
				}
			};

			const dispose = effect(render, scope);
			el.addEventListener("input", handleInput);
			el.addEventListener("change", handleInput);

			scope.cleanups.push(() => {
				dispose();
				el.removeEventListener("input", handleInput);
				el.removeEventListener("change", handleInput);
			});

			el.removeAttribute("@bind");
		} catch (err) {
			console.warn("[@bind] Invalid directive:", err);
		}
	});
}

function processAttrDirective(nodes, context, scope) {
	for (let i = 0; i < nodes.length; i++) {
		const el = nodes[i];
		const attrBindings = el.getAttribute("@attr");
		if (!attrBindings) continue;

		const items = splitBindingsBySpace(attrBindings);
		const bindings = [];

		for (let j = 0; j < items.length; j++) {
			const item = items[j];

			if (isQuotedString(item)) {
				console.warn("[@attr] Invalid quoted binding:", item);
				continue;
			}

			const parts = splitFirstUnquoted(item, ":");
			if (parts.length === 1) {
				console.warn("[@attr] Invalid binding:", item);
				continue;
			}

			const attrName = parts[0];
			const expr = parts[1];

			if (!attrName || !expr || isQuotedString(attrName)) {
				console.warn("[@attr] Invalid binding:", item);
				continue;
			}

			bindings.push({
				attrName,
				getter: createGetter(context, expr),
			});
		}

		const bindingsLength = bindings.length;

		const dispose = effect(() => {
			for (let k = 0; k < bindingsLength; k++) {
				const { attrName, getter } = bindings[k];

				try {
					const value = getter();

					if (value === false || value == null) {
						el.removeAttribute(attrName);
					} else if (value === true) {
						el.setAttribute(attrName, "");
					} else {
						el.setAttribute(attrName, String(value));
					}
				} catch (err) {
					console.warn(`[@attr] Error evaluating "${attrName}":`, err);
					el.removeAttribute(attrName);
				}
			}
		}, scope);

		scope.cleanups.push(dispose);
		el.removeAttribute("@attr");
	}
}

function normalizeStyleProp(prop) {
	return prop.includes("-")
		? prop.replace(/-([a-z])/g, (_, char) => char.toUpperCase())
		: prop;
}

function getStyleValue(el, prop) {
	return prop.startsWith("--")
		? el.style.getPropertyValue(prop)
		: el.style[normalizeStyleProp(prop)];
}

function setStyleValue(el, prop, value) {
	if (prop.startsWith("--")) {
		el.style.setProperty(prop, value);
		return;
	}

	el.style[normalizeStyleProp(prop)] = value;
}

function parseStyleDeclarations(value) {
	if (value === null || value === undefined || value === false) return [];

	if (typeof value === "object") {
		const result = [];
		const keys = Object.keys(value);
		const keysLength = keys.length;

		for (let i = 0; i < keysLength; i++) {
			const prop = keys[i];
			const styleValue = value[prop];

			if (
				styleValue === null ||
				styleValue === undefined ||
				styleValue === false
			) {
				continue;
			}

			result.push([prop, String(styleValue)]);
		}

		return result;
	}

	const result = [];
	const declarations = String(value).split(";");
	const declarationsLength = declarations.length;

	for (let i = 0; i < declarationsLength; i++) {
		const decl = declarations[i].trim();
		if (!decl) continue;

		const parts = splitFirstUnquoted(decl, ":");
		if (!parts[0] || parts[1] === undefined) continue;

		result.push([parts[0].trim(), parts[1].trim()]);
	}

	return result;
}

function createStyleWriter(el) {
	const originals = new Map();

	const remember = (prop) => {
		if (!originals.has(prop)) originals.set(prop, getStyleValue(el, prop));
	};

	return {
		set(prop, value) {
			remember(prop);
			setStyleValue(el, prop, value);
		},
		restore(prop) {
			if (!originals.has(prop)) {
				setStyleValue(el, prop, "");
				return;
			}

			setStyleValue(el, prop, originals.get(prop) || "");
		},
	};
}

function createStyleDeclarationBinding(context, expr) {
	const getter = createGetter(context, expr);
	let previous = [];

	return {
		type: "declarations",
		apply(writer) {
			previous.forEach(([prop]) => writer.restore(prop));

			const declarations = parseStyleDeclarations(getter());
			declarations.forEach(([prop, value]) => writer.set(prop, value));
			previous = declarations;
		},
	};
}

function parseStyleBinding(context, item) {
	const parts = splitFirstUnquoted(item, ":");

	if (parts.length === 1) {
		return createStyleDeclarationBinding(context, item);
	}

	const left = parts[0].trim();
	const right = parts[1].trim();
	const leftToken = classifyToken(left);

	if (leftToken.type === "path" && typeof readPath(context, leftToken.value) === "function") {
		return createStyleDeclarationBinding(context, item);
	}

	if (leftToken.type !== "literal") {
		return {
			type: "property",
			prop: left,
			getter: createGetter(context, right),
		};
	}

	const declarations = parseStyleDeclarations(leftToken.value);
	const getter = createGetter(context, right);

	return {
		type: "conditional",
		declarations,
		getter,
	};
}

/**
 * Processes @style directives: inline style binding.
 * Syntax: property:path or quoted declarations for conditional styles.
 * @param {HTMLElement[]} nodes - Elements with @style.
 * @param {Object} context - Evaluation context.
 * @param {Object} scope - Effect scope.
 */
function processStyleDirective(nodes, context, scope) {
	nodes.forEach((el) => {
		const styleBindings = el.getAttribute("@style");
		if (!styleBindings) return;

		try {
			const writer = createStyleWriter(el);
			const bindings = splitBindingsBySpace(styleBindings).map((item) =>
				parseStyleBinding(context, item),
			);
			const previousConditionalProps = new Map();

			const dispose = effect(() => {
				bindings.forEach((binding) => {
					try {
						if (binding.type === "declarations") {
							binding.apply(writer);
							return;
						}

						if (binding.type === "property") {
							const value = binding.getter();
							if (value === null || value === undefined || value === false) {
								writer.restore(binding.prop);
							} else {
								writer.set(binding.prop, String(value));
							}

							return;
						}

						const active = !!binding.getter();
						const previous = previousConditionalProps.get(binding) || [];
						previous.forEach(([prop]) => writer.restore(prop));

						if (active) {
							binding.declarations.forEach(([prop, value]) =>
								writer.set(prop, value),
							);
							previousConditionalProps.set(binding, binding.declarations);
						} else {
							previousConditionalProps.delete(binding);
						}
					} catch (err) {
						console.warn("[@style] Error evaluating binding:", err);
					}
				});
			}, scope);

			scope.cleanups.push(dispose);
			el.removeAttribute("@style");
		} catch (err) {
			console.warn("[@style] Invalid directive:", err);
		}
	});
}

function processRefDirective(nodes, context) {
	nodes.forEach((el) => {
		const key = el.getAttribute("@ref")?.trim();
		if (!key) return;

		try {
			if (!context.refs) context.refs = {};
			context.refs[unquoteString(key)] = el;

			el.removeAttribute("@ref");
		} catch (err) {
			console.warn("[@ref] Invalid directive:", err);
		}
	});
}

function parseRules(str) {
	return splitBindingsBySpace(str).map((rule) => {
		const parts = splitFirstUnquoted(rule, ":");
		const name = parts[0];
		const arg = parts[1];
		return { name: name.trim(), arg: arg ? arg.trim() : null };
	});
}

function executeRule(rule, value) {
	switch (rule.name) {
		case "required":
			return value ? true : "This field is required";
		case "email":
			return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
				? true
				: "Invalid email address";
		case "min":
			return value.length >= Number(rule.arg)
				? true
				: `Minimum ${rule.arg} characters required`;
		case "max":
			return value.length <= Number(rule.arg)
				? true
				: `Maximum ${rule.arg} characters allowed`;
		default:
			console.warn(`[@validate] Unknown validation rule: ${rule.name}`);
			return true;
	}
}

function processValidateDirective(nodes, context, scope) {
	nodes.forEach((el) => {
		const rulesStr = el.getAttribute("@validate");
		if (!rulesStr) return;

		try {
			const errorKey = el.getAttribute("@validate-error") || (el.name ? `${el.name}_error` : "validation_error");
			const resolverInfo = parseResolver(rulesStr);
			const resolverFn =
				resolverInfo && readPath(context, resolverInfo.resolver);
			const rules = resolverFn ? null : parseRules(rulesStr);

			const validate = () => {
				const value = el.value != null ? String(el.value).trim() : "";
				let error = "";

				if (typeof resolverFn === "function") {
					const args = resolverInfo.args.map((arg) => resolveToken(context, arg));
					error = resolverFn(value, ...args) ? "" : "Validation failed";
				} else {
					for (const rule of rules) {
						const result = executeRule(rule, value);
						if (result !== true) {
							error = result;
							break;
						}
					}
				}

				setPath(context, errorKey, error);
				return !error;
			};

			el.addEventListener("input", validate);
			el.addEventListener("blur", validate);
			validate();

			scope.cleanups.push(() => {
				el.removeEventListener("input", validate);
				el.removeEventListener("blur", validate);
			});

			el.removeAttribute("@validate");
			el.removeAttribute("@validate-error");
		} catch (err) {
			console.warn("[@validate] Invalid directive:", err);
		}
	});
}

export function bindDOM(
	directives,
	context = {},
	scope = { effects: [], cleanups: [] }
) {
	processRefDirective(directives.ref, context);
	processForDirective(directives.for, context, scope);
	processTextDirective(directives.text, context, scope);
	processIfDirective(directives.if, context, scope);
	processShowDirective(directives.show, context, scope);
	processEventDirective(directives.on, context, scope);
	processBindDirective(directives.bind, context, scope);
	processClassDirective(directives.class, context, scope);
	processStyleDirective(directives.style, context, scope);
	processAttrDirective(directives.attr, context, scope);
	processTeleportDirective(directives.teleport, scope);
	processValidateDirective(directives.validate, context, scope);

	// === FINAL STEP: Flush all queued child bindings ===
	scheduleFlush();
}
