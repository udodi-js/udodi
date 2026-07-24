/**
 * Trims whitespace from the beginning and end of a value.
 *
 * @param {any} value - The input value.
 * @returns {string} The trimmed string, or an empty string for nullish values.
 */
export function trim(value) {
	return value == null ? "" : String(value).trim();
}

/**
 * Returns a value from an Array, Map, Set, or Object using the provided key.
 *
 * @param {any} collection - The source collection or object.
 * @param {any} key - The key, property name, or index used to retrieve the value.
 * @returns {any} The retrieved value, or undefined if unavailable.
 */
export function get(collection, key) {
	if (collection == null) {
		return undefined;
	}

	if (collection instanceof Map) {
		return collection.get(key);
	}

	if (collection instanceof Set) {
		return collection.has(key) ? key : undefined;
	}

	return collection[key];
}

/**
 * Converts a value to uppercase.
 *
 * @param {any} value - The input value.
 * @returns {string} The uppercase string representation.
 */
export function upper(value) {
	return value == null ? "" : String(value).toUpperCase();
}

/**
 * Converts a value to lowercase.
 *
 * @param {any} value - The input value.
 * @returns {string} The lowercase string representation.
 */
export function lower(value) {
	return value == null ? "" : String(value).toLowerCase();
}

/**
 * Capitalizes the first character of every whitespace-delimited word.
 *
 * @param {any} value - The input value.
 * @returns {string} The capitalized string.
 */
export function capitalise(value) {
	const str = value == null ? "" : String(value);
	const length = str.length;

	if (length === 0) {
		return "";
	}

	let result = "";
	let capitalizeNext = true;

	for (let i = 0; i < length; i++) {
		const char = str[i];

		if (
			char === " " ||
			char === "\t" ||
			char === "\n" ||
			char === "\r"
		) {
			result += char;
			capitalizeNext = true;

		} else if (capitalizeNext) {
			result += char.toUpperCase();
			capitalizeNext = false;
			
		} else {
			result += char;
		}
	}

	return result;
}

/**
 * Returns the size of an Array, Map, Set, or Object.
 *
 * @param {any} collection - The target collection.
 * @returns {number} The number of items or properties.
 */
export function size(collection) {
	if (collection == null) {
		return 0;
	}

	if (typeof collection.size === "number") {
		return collection.size;
	}

	if (typeof collection.length === "number") {
		return collection.length;
	}

	let count = 0;

	for (const key in collection) {
		if (Object.prototype.hasOwnProperty.call(collection, key)) {
			count++;
		}
	}

	return count;
}

/**
 * Returns the boolean negation of a value.
 *
 * @param {any} value - The input value.
 * @returns {boolean} The negated boolean value.
 */
export function negate(value) {
	return !value;
}

export const stdlib = {
	trim,
	get,
	upper,
	lower,
	capitalise,
	size,
	negate,
	n: negate,
};
