---
description: Security review of code — checks OWASP Top 10, auth gaps, injection risks, exposed secrets, missing input validation
argument-hint: <file-or-diff>
allowed-tools: Read Bash Grep
---

Review the provided code or diff for security issues. Group findings by severity: Critical, High, Medium, Low.

Check for:
- OWASP Top 10 vulnerabilities (injection, XSS, broken auth, etc.)
- Hardcoded secrets or credentials
- Insecure direct object references
- Missing input validation
- Overly permissive CORS or auth rules
