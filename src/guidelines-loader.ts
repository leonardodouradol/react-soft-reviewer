import * as fs from 'fs';
import * as path from 'path';

export function loadGuidelines(filename: string): string {
    try {
        const filePath = path.join(__dirname, '..', 'prompts', filename);
        return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
        throw new Error(`Failed to load guidelines from ${filename}: ${error}`);
    }
}
