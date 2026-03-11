import { Project, ScriptTarget } from 'ts-morph';
import * as core from '@actions/core';
import { detectReactPatterns, AstFinding } from './react-pattern-detectors';

/**
 * Analyses a single React file with ts-morph.
 * Returns an array of findings. An empty array means the AI pipeline is skipped.
 */
export async function analyzeAST(filePath: string): Promise<AstFinding[]> {
    const project = new Project({
        compilerOptions: {
            target: ScriptTarget.ESNext,
            jsx: 2, // JsxEmit.React
            allowJs: true,
            skipLibCheck: true,
        },
        // Do NOT add tsconfig.json from disk – analyse the file in isolation
        skipAddingFilesFromTsConfig: true,
    });

    try {
        project.addSourceFileAtPath(filePath);
        const sourceFile = project.getSourceFileOrThrow(filePath);

        const findings = detectReactPatterns(sourceFile);

        if (findings.length > 0) {
            core.info(`AST: found ${findings.length} suspicious pattern(s) in ${filePath}`);
            for (const f of findings) {
                core.debug(`  [${f.pattern}] line ${f.line}: ${f.message}`);
            }
        }

        return findings;
    } catch (error) {
        core.warning(`AST analysis failed for ${filePath}: ${error}`);
        return [];
    }
}

/**
 * Run AST analysis across all changed React files in parallel.
 * Returns a merged, ordered list of findings.
 */
export async function analyzeASTBatch(filePaths: string[]): Promise<AstFinding[]> {
    const allFindings = await Promise.all(filePaths.map(analyzeAST));
    return allFindings.flat();
}
