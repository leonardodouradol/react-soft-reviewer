import { ESLint } from 'eslint';
import * as core from '@actions/core';

export interface EslintResult {
    file: string;
    line: number;
    message: string;
    ruleId: string | null;
}

export async function runEslint(file: string): Promise<EslintResult[]> {
    try {
        const eslint = new ESLint({
            useEslintrc: false,
            overrideConfig: {
                parserOptions: {
                    ecmaVersion: 2021,
                    sourceType: 'module',
                    ecmaFeatures: {
                        jsx: true
                    }
                },
                plugins: ['react', 'react-hooks'],
                rules: {
                    'react-hooks/rules-of-hooks': 'error',
                    'react-hooks/exhaustive-deps': 'warn'
                }
            }
        });

        const results = await eslint.lintFiles([file]);
        const formattedResults: EslintResult[] = [];

        for (const result of results) {
            for (const message of result.messages) {
                formattedResults.push({
                    file: result.filePath,
                    line: message.line,
                    message: message.message,
                    ruleId: message.ruleId
                });
            }
        }

        return formattedResults;
    } catch (error) {
        core.warning(`ESLint failed for ${file}: ${error}`);
        return [];
    }
}
