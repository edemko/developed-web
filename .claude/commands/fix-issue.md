---
description: Fix a GitHub issue by number or URL
argument-hint: <issue-number-or-url>
allowed-tools: Read Edit Write Bash Grep Glob
---

Fix the GitHub issue: $ARGUMENTS

Steps:
1. Read the issue description carefully
2. Find the relevant code
3. Implement the fix with minimal scope — don't refactor unrelated code
4. Verify the fix doesn't break existing behaviour
5. Summarize what was changed and why
