"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTSConfigRootDirFromStack = getTSConfigRootDirFromStack;
const node_url_1 = require("node:url");
function getTSConfigRootDirFromStack(stack) {
    for (const line of stack.split('\n').map(line => line.trim())) {
        const candidate = /(\S+)eslint\.config\.(c|m)?(j|t)s/.exec(line)?.[1];
        if (!candidate) {
            continue;
        }
        return candidate.startsWith('file://')
            ? (0, node_url_1.fileURLToPath)(candidate)
            : candidate;
    }
    return undefined;
}
