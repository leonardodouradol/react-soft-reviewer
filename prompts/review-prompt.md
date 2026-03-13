Review the following React code changes.

File: {{FILE_NAME}}

--- VERCEL REACT BEST PRACTICES ---
{{BEST_PRACTICES}}

--- AST SCANNER FINDINGS ---
{{AST_CONTEXT}}

--- GIT DIFF ---
{{DIFF}}

Instructions:
1. For each AST finding, check the diff and decide: true positive or false positive?
2. Look for additional violations not caught by the AST scanner.
3. Apply the rules from the system prompt strictly.
4. Return ONLY a valid JSON array. No markdown. No explanation. No code fences.
