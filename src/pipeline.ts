import * as core from '@actions/core';
import { getChangedReactFiles } from './changed-files';
import { runEslint } from './eslint-runner';
import { analyzeAST } from './ast-analyzer';
import { reviewWithLLM } from './llm-review';
import { postComments, ReviewComment } from './github-comments';

export interface PipelineOptions {
    githubToken: string;
    aiApiKey: string;
    model: string;
}

export async function runPipeline(options: PipelineOptions): Promise<number> {
    core.info('Starting React AI Review Pipeline...');

    // 1. Get changed files
    const changedFiles = await getChangedReactFiles(options.githubToken);
    if (changedFiles.length === 0) {
        core.info('No React files (.ts, .tsx) changed. Skipping review.');
        return 0;
    }
    core.info(`Found ${changedFiles.length} changed React files.`);

    let totalIssues = 0;
    const allComments: ReviewComment[] = [];

    for (const file of changedFiles) {
        core.startGroup(`Analyzing ${file}`);

        // 2. ESLint checks
        core.info('Running ESLint baseline...');
        const eslintResults = await runEslint(file);
        if (eslintResults.length > 0) {
            core.info(`ESLint found ${eslintResults.length} issues in ${file}`);
        }

        // 3. AST Analysis
        core.info('Scanning AST for suspicious React patterns...');
        const astFindings = await analyzeAST(file);

        if (astFindings.length > 0) {
            const patterns = [...new Set(astFindings.map(f => f.pattern))].join(', ');
            core.info(`AST scanner found ${astFindings.length} suspicious pattern(s): [${patterns}]. Invoking LLM...`);
            // 4. LLM Review (Conditional)
            const aiReviewFindings = await reviewWithLLM(file, astFindings, options);
            core.info(`LLM confirmed ${aiReviewFindings.length} issues to report.`);

            allComments.push(...aiReviewFindings);
            totalIssues += aiReviewFindings.length;
        } else {
            core.info('No suspicious AST patterns found. Skipping LLM review.');
        }

        core.endGroup();
    }

    // 5. Post Comments
    if (allComments.length > 0) {
        core.info(`Posting ${allComments.length} review comments to GitHub PR...`);
        await postComments(allComments, options.githubToken);
    } else {
        core.info('No issues to report. Great job!');
    }

    return totalIssues;
}
