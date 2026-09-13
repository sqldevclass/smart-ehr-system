# Replace physician lab-results layout

## Scope
- Replace only `src/components/physician/PhysicianResultsTab.tsx`.
- Render one six-column heading for current results and one for expanded history.
- Group every completed sample by test name and date, with matching parameter rows beneath it.
- Keep parameter-name search, hiding groups without matches.

## Technical details
- Preserve the existing completed-sample query and current/history partitioning.
- Reconstruct the JSX omitted from the pasted replacement using the supplied class patterns.
- Verify the project build after the replacement.
