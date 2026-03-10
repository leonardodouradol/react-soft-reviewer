import { Project } from 'ts-morph';
import * as core from '@actions/core';
import { detectReactPatterns, AstFinding } from './react-pattern-detectors';

export async function analyzeAST(filePath: string): Promise<AstFinding[]> {
    const project = new Project({
        compilerOptions: {
            allowJs: true,
            jsx: 2 // React
        }
    });

    try {
        project.addSourceFileAtPath(filePath);
        const sourceFile = project.getSourceFileOrThrow(filePath);

        // Run detectors
        const findings = detectReactPatterns(sourceFile);

        return findings;
    } catch (error) {
        core.warning(`AST Analysis failed for ${filePath}: ${error}`);
        return [];
    }
}
