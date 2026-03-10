import * as github from '@actions/github';
import * as core from '@actions/core';

export interface ReviewComment {
    file: string;
    line: number;
    severity: string;
    message: string;
}

export async function postComments(comments: ReviewComment[], token: string): Promise<void> {
    const octokit = github.getOctokit(token);
    const { context } = github;

    if (!context.payload.pull_request) {
        core.warning('Not running in a pull request context. Cannot post comments.');
        return;
    }

    const owner = context.repo.owner;
    const repo = context.repo.repo;
    const pull_number = context.payload.pull_request.number;
    // Fallback to push SHA if pull_request.head.sha is not available
    const commit_id = context.payload.pull_request.head?.sha || context.sha;

    for (const comment of comments) {
        try {
            await octokit.rest.pulls.createReviewComment({
                owner,
                repo,
                pull_number,
                commit_id,
                path: comment.file,
                line: comment.line,
                side: 'RIGHT',
                body: `**[${comment.severity.toUpperCase()}] AI Review:**\n${comment.message}`
            });
            core.info(`Posted comment on ${comment.file}:${comment.line}`);
        } catch (error) {
            core.warning(`Failed to post comment on ${comment.file}:${comment.line}. Error: ${error}`);
        }
    }
}
