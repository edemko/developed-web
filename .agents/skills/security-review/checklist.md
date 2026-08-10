# Security Review Checklist

## Input Validation
- [ ] All user inputs validated at system boundaries
- [ ] No SQL/command injection vectors
- [ ] XSS protections in place

## Authentication & Authorization
- [ ] Auth checks on all protected routes
- [ ] No IDOR vulnerabilities
- [ ] Tokens/secrets not logged or exposed

## Data
- [ ] Sensitive data encrypted at rest
- [ ] No hardcoded credentials
- [ ] Minimal data exposure in responses
