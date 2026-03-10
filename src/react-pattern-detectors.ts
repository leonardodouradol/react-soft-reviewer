import { SourceFile, SyntaxKind } from 'ts-morph';

export interface AstFinding {
    file: string;
    line: number;
    message: string;
    snippet: string;
}

export function detectReactPatterns(sourceFile: SourceFile): AstFinding[] {
    const findings: AstFinding[] = [];
    const fileName = sourceFile.getFilePath();

    // Pattern 1: useEffect containing useState (potential derived state)
    const useEffectCalls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(call => call.getExpression().getText() === 'useEffect');

    for (const effect of useEffectCalls) {
        const setStateCalls = effect.getDescendantsOfKind(SyntaxKind.CallExpression)
            .filter(call => {
                const text = call.getExpression().getText();
                return text.startsWith('set') && text.length > 3; // basic heuristic for setState
            });

        if (setStateCalls.length > 0) {
            findings.push({
                file: fileName,
                line: effect.getStartLineNumber(),
                message: 'Derived state detected inside useEffect. Consider using useMemo instead or calculating during render.',
                snippet: effect.getText().substring(0, 150) + '...'
            });
        }
    }

    // We could add more checks like: missing memos on context providers, large objects in dependencies, etc.

    return findings;
}
