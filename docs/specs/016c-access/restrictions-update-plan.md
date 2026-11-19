# C1 restrictions update

Spec: Waleed decision 2026-11-19, spec and plan at 4f343da.

1. Add the five-key default/deny contract and row mapping.
2. Replace all eleven managed keys within the existing locked, audited withUser transaction; preserve unknown rows.
3. Add a restrictions switch group and send both full state records.
4. Update domain, use-case, server-boundary and editor tests; prepare integration tests for Claude Code.
5. Run the suite serially, lint, and fixture-based light/dark viewport checks. No SQL execution, auth change, PR, or C2/C3.
