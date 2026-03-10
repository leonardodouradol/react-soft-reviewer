import * as core from '@actions/core';
import { runPipeline } from './pipeline';

async function run(): Promise<void> {
    try {
        const githubToken = core.getInput('github-token', { required: true });
        const aiApiKey = core.getInput('ai-api-key', { required: true });
        const model = core.getInput('model') || 'gpt-4o';

        const issuesCount = await runPipeline({
            githubToken,
            aiApiKey,
            model,
        });

        core.setOutput('issues-found', issuesCount);
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            core.setFailed('An unexpected error occurred');
        }
    }
}

run();
