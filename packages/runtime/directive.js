const DIRECTIVES = {
    '@text': 'text',
    '@bind': 'bind',
    '@on': 'on',
    '@for': 'for',
    '@if': 'if',
    '@elseif': 'elseif',
    '@else': 'else',
    '@show': 'show',
    '@class': 'class',
    '@style': 'style',
    '@attr': 'attr',
    '@ref': 'ref',
    '@teleport': 'teleport',
    '@validate': 'validate',
};

export const DIRECTIVE_ATTRIBUTES = [
    ...Object.keys(DIRECTIVES),
    '@key',
    '@validate-error',
];

/**
 * @import { DirectiveGroups } from '../types/directives.js'
 */

/**
 * Extracts all directives from the DOM tree in a single traversal.
 * This function performs a single traversal of the DOM to collect nodes for all directive types.
 * 
 * @param {HTMLElement} root - The root element to start the traversal from.
 * @returns {DirectiveGroups} An object containing arrays of nodes for each directive type.
 */
export function extractAllDirectives(root) {
    const directives = {
        text: [],
        bind: [],
        on: [],
        for: [],
        if: [],
        elseif: [],
        else: [],
        show: [],
        class: [],
        style: [],
        attr: [],
        ref: [],
        teleport: [],
        validate: []
    };

    const stack = [root];

    while (stack.length) {
        const node = stack.pop();

        if (node.nodeType !== Node.ELEMENT_NODE) {
            continue;
        }

        // Scan only existing attributes
        for (const attr of node.attributes) {
            const directive = DIRECTIVES[attr.name];

            if (directive) {
                directives[directive].push(node);
            }
        }

        // Skip descendants of @for
        if (node.hasAttribute('@for')) {
            continue;
        }

        // Preserve DOM order
        let child = node.lastElementChild;

        while (child) {
            stack.push(child);
            child = child.previousElementSibling;
        }
    }

    return directives;
}
