import * as github from '@actions/github';
import simpleGit from 'simple-git';

export async function getChangedReactFiles(token: string): Promise<string[]> {
    const octokit = github.getOctokit(token);
    const { context } = github;

    if (!context.payload.pull_request) {
        // If not a PR, we might use simple-git to get changes in the last commit
        const git = simpleGit();
        const diff = await git.diffSummary(['HEAD~1', 'HEAD']);
        return diff.files
            .filter(f => f.file.endsWith('.ts') || f.file.endsWith('.tsx'))
            .map(f => f.file);
    }

    const owner = context.repo.owner;
    const repo = context.repo.repo;
    const pull_number = context.payload.pull_request.number;

    const { data: files } = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number,
    });

    const changedReactFiles = files
        .filter(f => f.status !== 'removed')
        .filter(f => f.filename.endsWith('.ts') || f.filename.endsWith('.tsx'))
        .map(f => f.filename);

    return changedReactFiles;
}

export async function getFileDiff(file: string): Promise<string> {
    const git = simpleGit();
    // Assuming we want the diff of the file either against main or HEAD~1
    // For PRs, checking out the merge commit usually means HEAD contains the changes. Wait, we want the diff that the PR introduces.
    // simpler: git diff origin/main...HEAD -- file
    try {
        const diff = await git.diff(['HEAD~1', 'HEAD', '--', file]);
        return diff;
    } catch {
        return '';
    }
}
