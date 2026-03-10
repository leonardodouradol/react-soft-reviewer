import fetch from 'node-fetch';
import * as core from '@actions/core';
import { PipelineOptions } from './pipeline';
import { AstFinding } from './react-pattern-detectors';
import { ReviewComment } from './github-comments';
import { loadGuidelines } from './guidelines-loader';
import { getFileDiff } from './changed-files';

export async function reviewWithLLM(
    file: string,
    astFindings: AstFinding[],
    options: PipelineOptions
): Promise<ReviewComment[]> {
    const systemPrompt = loadGuidelines('system-prompt.md');
    const bestPractices = loadGuidelines('react-best-practices.md');
    const reviewPromptTemplate = loadGuidelines('review-prompt.md');
    const astContextTemplate = loadGuidelines('ast-context.md');

    const diff = await getFileDiff(file);

    const astContextStr = astFindings.map(f =>
        `- Line ${f.line}: ${f.message}\n  Snippet: \`${f.snippet}\``
    ).join('\n');

    const userPrompt = reviewPromptTemplate
        .replace('{{FILE_NAME}}', file)
        .replace('{{DIFF}}', diff)
        .replace('{{AST_CONTEXT}}', astContextTemplate.replace('{{FINDINGS}}', astContextStr))
        .replace('{{BEST_PRACTICES}}', bestPractices);

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${options.aiApiKey}`
            },
            body: JSON.stringify({
                model: options.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.2,
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            core.setFailed(`LLM API error: ${response.status} ${errorText}`);
            return [];
        }

        const data = await response.json() as any;
        const content = data.choices[0].message.content;

        // Parse JSON from markdown code block if present
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[1] : content;

        const parsedComments: ReviewComment[] = JSON.parse(jsonString);

        // Ensure all comments have the correct file name
        return parsedComments.map(c => ({ ...c, file }));
    } catch (error) {
        core.warning(`LLM review failed for ${file}: ${error}`);
        return [];
    }
}
