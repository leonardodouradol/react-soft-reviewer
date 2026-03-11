import {
    SourceFile,
    SyntaxKind,
    CallExpression,
    JsxAttribute,
    VariableDeclaration,
    Node,
} from 'ts-morph';

// ─── Output Contract ─────────────────────────────────────────────────────────

export type PatternKind =
    | 'derived-state-useEffect'
    | 'inline-arrow-jsx'
    | 'expensive-render-calculation'
    | 'state-derived-from-props'
    | 'large-component'
    | 'related-state-useEffects'
    | 'nested-fetch-in-useEffect';

export type Severity = 'suspicious' | 'warning' | 'info';

export interface AstFinding {
    file: string;
    line: number;
    pattern: PatternKind;
    severity: Severity;
    message: string;
    code: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EXPENSIVE_FN_NAMES = new Set([
    'sort',
    'filter',
    'reduce',
    'map',
    'flatMap',
    'find',
    'findIndex',
    'forEach',
]);

const EXPENSIVE_STANDALONE = new Set([
    'JSON.parse',
    'JSON.stringify',
    'Object.keys',
    'Object.values',
    'Object.entries',
]);

/** Truncate code snippet for readability */
function snippet(node: Node, maxLen = 120): string {
    const text = node.getText().replace(/\s+/g, ' ').trim();
    return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

/** Checks whether a CallExpression looks like a setState setter (setXxx pattern). */
function isSetterCall(call: CallExpression): boolean {
    const expr = call.getExpression().getText();
    return /^set[A-Z]/.test(expr);
}

// ─── Individual Detectors ─────────────────────────────────────────────────────

/**
 * PATTERN 1 – useEffect that derives state
 *
 * Detects useEffect callbacks that contain a setState call (setXxx(...)). 
 * Derived state should be computed during render with useMemo.
 */
function detectDerivedStateInEffect(sourceFile: SourceFile): AstFinding[] {
    const findings: AstFinding[] = [];
    const file = sourceFile.getFilePath();

    const effects = sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(c => c.getExpression().getText() === 'useEffect');

    for (const effect of effects) {
        const setterCalls = effect
            .getDescendantsOfKind(SyntaxKind.CallExpression)
            .filter(isSetterCall);

        if (setterCalls.length > 0) {
            findings.push({
                file,
                line: effect.getStartLineNumber(),
                pattern: 'derived-state-useEffect',
                severity: 'suspicious',
                message:
                    'State is being derived inside useEffect via a setter call. ' +
                    'Consider computing this value during render with useMemo to avoid redundant cycles.',
                code: snippet(effect),
            });
        }
    }

    return findings;
}

/**
 * PATTERN 2 – Inline arrow functions inside JSX attributes
 *
 * Detects JSX attributes (e.g. onClick, onChange) whose value is an arrow function
 * literal. These create brand-new function references on every render, breaking
 * React.memo and triggering unnecessary child re-renders.
 */
function detectInlineArrowsInJsx(sourceFile: SourceFile): AstFinding[] {
    const findings: AstFinding[] = [];
    const file = sourceFile.getFilePath();

    // Gather all JSX attributes
    const jsxAttrs = sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute) as JsxAttribute[];

    for (const attr of jsxAttrs) {
        const initializer = attr.getInitializer();
        if (!initializer) continue;

        // The value is wrapped in { } -> JsxExpression
        if (initializer.getKind() !== SyntaxKind.JsxExpression) continue;

        const jsxExpr = initializer.asKindOrThrow(SyntaxKind.JsxExpression);
        const expr = jsxExpr.getExpression();
        if (!expr) continue;

        const kind = expr.getKind();
        if (
            kind === SyntaxKind.ArrowFunction ||
            kind === SyntaxKind.FunctionExpression
        ) {
            const attrName = attr.getNameNode().getText();
            // Only warn for event handlers (on*) – reduces noise
            if (!attrName.startsWith('on')) continue;

            findings.push({
                file,
                line: attr.getStartLineNumber(),
                pattern: 'inline-arrow-jsx',
                severity: 'warning',
                message:
                    `Inline arrow function passed to \`${attrName}\`. ` +
                    'Each render creates a new function reference. ' +
                    'Wrap with useCallback if this component is memory-sensitive or has memoized children.',
                code: snippet(attr),
            });
        }
    }

    return findings;
}

/**
 * PATTERN 3 – Expensive calculations during render
 *
 * Detects top-level variable declarations inside function/arrow components that
 * invoke known expensive methods (.sort, .filter, .reduce, JSON.parse …) without
 * being wrapped in useMemo.
 */
function detectExpensiveRenderCalculations(sourceFile: SourceFile): AstFinding[] {
    const findings: AstFinding[] = [];
    const file = sourceFile.getFilePath();

    // Walk all variable declarations that have a call-expression initializer
    const varDecls = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration) as VariableDeclaration[];

    for (const decl of varDecls) {
        const init = decl.getInitializer();
        if (!init) continue;

        const kind = init.getKind();

        // Ignore useMemo / useCallback wrappers
        if (kind === SyntaxKind.CallExpression) {
            const callText = init.getText();
            if (callText.startsWith('useMemo') || callText.startsWith('useCallback')) continue;
        }

        // Detect chained expensive array calls (arr.filter(...).sort(...))
        const chainedCalls = init
            .getDescendantsOfKind(SyntaxKind.CallExpression)
            .filter(c => {
                const propAccess = c.getExpression();
                if (propAccess.getKind() === SyntaxKind.PropertyAccessExpression) {
                    const method = propAccess
                        .asKindOrThrow(SyntaxKind.PropertyAccessExpression)
                        .getName();
                    return EXPENSIVE_FN_NAMES.has(method);
                }
                return false;
            });

        // Detect standalone expensive functions (JSON.parse etc.)
        const standaloneCalls = init
            .getDescendantsOfKind(SyntaxKind.CallExpression)
            .filter(c => EXPENSIVE_STANDALONE.has(c.getExpression().getText()));

        if (chainedCalls.length > 0 || standaloneCalls.length > 0) {
            findings.push({
                file,
                line: decl.getStartLineNumber(),
                pattern: 'expensive-render-calculation',
                severity: 'suspicious',
                message:
                    `"${decl.getName()}" performs an expensive operation (${[
                        ...chainedCalls.map(c => c.getExpression().getText().split('.').pop()!),
                        ...standaloneCalls.map(c => c.getExpression().getText()),
                    ]
                        .slice(0, 3)
                        .join(', ')}) on every render. Wrap in useMemo.`,
                code: snippet(decl),
            });
        }
    }

    return findings;
}

/**
 * PATTERN 4 – State initialised from props, then updated via useEffect
 *
 * Detects the pattern: useState(prop) + useEffect(() => setState(prop), [prop]).
 * This is an anti-pattern because the state lags one render behind the prop.
 */
function detectStateDerivedFromProps(sourceFile: SourceFile): AstFinding[] {
    const findings: AstFinding[] = [];
    const file = sourceFile.getFilePath();

    // Collect all useState calls so we know which state setters exist
    const useStateCalls = sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(c => c.getExpression().getText() === 'useState');

    const knownSetters = new Set<string>();
    for (const call of useStateCalls) {
        const parent = call.getParent();
        if (parent?.getKind() === SyntaxKind.VariableDeclaration) {
            const decl = parent.asKindOrThrow(SyntaxKind.VariableDeclaration);
            const nameNode = decl.getNameNode();
            if (nameNode.getKind() === SyntaxKind.ArrayBindingPattern) {
                const elements = nameNode
                    .asKindOrThrow(SyntaxKind.ArrayBindingPattern)
                    .getElements();
                if (elements.length >= 2) {
                    knownSetters.add(elements[1].getText().trim());
                }
            }
        }
    }

    // In each useEffect, check if the body calls a known setter AND the deps look like props
    const effects = sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(c => c.getExpression().getText() === 'useEffect');

    for (const effect of effects) {
        const setterCallsInEffect = effect
            .getDescendantsOfKind(SyntaxKind.CallExpression)
            .filter(c => knownSetters.has(c.getExpression().getText()));

        if (setterCallsInEffect.length > 0) {
            findings.push({
                file,
                line: effect.getStartLineNumber(),
                pattern: 'state-derived-from-props',
                severity: 'suspicious',
                message:
                    'State appears to be derived from props using useEffect. ' +
                    'This introduces a one-render lag. Compute the value directly during render or lift state up.',
                code: snippet(effect),
            });
        }
    }

    return findings;
}

/**
 * PATTERN 5 – Components larger than 300 lines
 *
 * Over-sized components are hard to maintain, test, and optimise. React Compiler
 * also struggles to memoize very large render functions.
 */
function detectLargeComponents(sourceFile: SourceFile): AstFinding[] {
    const findings: AstFinding[] = [];
    const file = sourceFile.getFilePath();
    const LIMIT = 300;

    // Walk all function / arrow function declarations that could be React components
    const functionDecls = [
        ...sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration),
        ...sourceFile.getDescendantsOfKind(SyntaxKind.FunctionExpression),
        ...sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction),
    ];

    for (const fn of functionDecls) {
        const start = fn.getStartLineNumber();
        const end = fn.getEndLineNumber();
        const lineCount = end - start + 1;

        if (lineCount > LIMIT) {
            // Only flag if function name starts with uppercase (React component convention)
            let name = '<anonymous>';
            const parent = fn.getParent();
            if (parent?.getKind() === SyntaxKind.VariableDeclaration) {
                name = parent.asKindOrThrow(SyntaxKind.VariableDeclaration).getName();
            } else if (fn.getKind() === SyntaxKind.FunctionDeclaration) {
                const decl = fn.asKindOrThrow(SyntaxKind.FunctionDeclaration);
                name = decl.getName() ?? '<anonymous>';
            }

            if (name === '<anonymous>' || /^[A-Z]/.test(name)) {
                findings.push({
                    file,
                    line: start,
                    pattern: 'large-component',
                    severity: 'warning',
                    message:
                        `Component "${name}" spans ${lineCount} lines (limit: ${LIMIT}). ` +
                        'Split into smaller, focused sub-components for maintainability and better memoization.',
                    code: `function ${name}(...) { /* ${lineCount} lines */ }`,
                });
            }
        }
    }

    return findings;
}

/**
 * PATTERN 6 – Multiple useEffect hooks that manipulate related state
 *
 * When 2+ useEffect hooks in the same component call setters for the same state
 * variable, it usually signals orchestration logic that should be colocated.
 */
function detectRelatedStateEffects(sourceFile: SourceFile): AstFinding[] {
    const findings: AstFinding[] = [];
    const file = sourceFile.getFilePath();

    const effects = sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(c => c.getExpression().getText() === 'useEffect');

    if (effects.length < 2) return findings;

    // Build map: setter name -> list of effects that use it
    const setterToEffects = new Map<string, CallExpression[]>();

    for (const effect of effects) {
        const setterCalls = effect
            .getDescendantsOfKind(SyntaxKind.CallExpression)
            .filter(isSetterCall);

        for (const sc of setterCalls) {
            const name = sc.getExpression().getText();
            if (!setterToEffects.has(name)) {
                setterToEffects.set(name, []);
            }
            setterToEffects.get(name)!.push(effect);
        }
    }

    for (const [setter, relatedEffects] of setterToEffects) {
        if (relatedEffects.length >= 2) {
            const lines = relatedEffects.map(e => e.getStartLineNumber()).join(', ');
            findings.push({
                file,
                line: relatedEffects[0].getStartLineNumber(),
                pattern: 'related-state-useEffects',
                severity: 'suspicious',
                message:
                    `"${setter}" is mutated in ${relatedEffects.length} separate useEffect hooks (lines ${lines}). ` +
                    'Consolidate into a single effect or use a reducer to avoid race conditions.',
                code: snippet(relatedEffects[0]),
            });
        }
    }

    return findings;
}

/**
 * PATTERN 7 – Nested fetch / async calls inside useEffect
 *
 * Nested fetch calls (fetch inside a .then callback or inside an async function
 * that is itself inside a useEffect) are hard to cancel, leak on unmount,
 * and make error handling complex.
 */
function detectNestedFetchInEffect(sourceFile: SourceFile): AstFinding[] {
    const findings: AstFinding[] = [];
    const file = sourceFile.getFilePath();

    const effects = sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(c => c.getExpression().getText() === 'useEffect');

    for (const effect of effects) {
        // All fetch() calls inside this effect
        const fetchCalls = effect
            .getDescendantsOfKind(SyntaxKind.CallExpression)
            .filter(c => c.getExpression().getText() === 'fetch');

        // A "nested" fetch is one whose ancestor (still within the effect) is another call (e.g. .then)
        const nestedFetches = fetchCalls.filter(fc => {
            let parent = fc.getParent();
            while (parent && parent !== effect) {
                const kind = parent.getKind();
                if (
                    kind === SyntaxKind.CallExpression ||
                    kind === SyntaxKind.ArrowFunction ||
                    kind === SyntaxKind.FunctionExpression
                ) {
                    // If a sibling ancestor is also a fetch() – it's nested
                    const ancestorFetches = parent
                        .getDescendantsOfKind(SyntaxKind.CallExpression)
                        .filter(c => c !== fc && c.getExpression().getText() === 'fetch');
                    if (ancestorFetches.length > 0) return true;
                }
                parent = parent.getParent();
            }
            return false;
        });

        if (nestedFetches.length > 0) {
            findings.push({
                file,
                line: effect.getStartLineNumber(),
                pattern: 'nested-fetch-in-useEffect',
                severity: 'suspicious',
                message:
                    'Nested fetch calls detected inside useEffect. ' +
                    'Parallel requests should use Promise.all; sequential chains belong in a dedicated async utility or React Query.',
                code: snippet(effect),
            });
        }
    }

    return findings;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Run all pattern detectors on a single source file.
 * Returns a flat, de-duplicated list of findings.
 */
export function detectReactPatterns(sourceFile: SourceFile): AstFinding[] {
    const detectors = [
        detectDerivedStateInEffect,
        detectInlineArrowsInJsx,
        detectExpensiveRenderCalculations,
        detectStateDerivedFromProps,
        detectLargeComponents,
        detectRelatedStateEffects,
        detectNestedFetchInEffect,
    ];

    const findings: AstFinding[] = [];
    for (const detect of detectors) {
        findings.push(...detect(sourceFile));
    }

    // De-duplicate by file + line + pattern
    const seen = new Set<string>();
    return findings.filter(f => {
        const key = `${f.file}:${f.line}:${f.pattern}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
