# Pull Request Checklist

Use this short checklist before opening a ClinIA pull request.

- Keep the change small and auditable.
- Confirm patient-identifying data is not logged or sent to cloud services.
- For application changes, run the most relevant backend or frontend tests.
- For documentation changes, follow the [format and local link checks](ci-documentation.md).
  Eligible documentation-only PRs keep both required checks and skip application
  tests, builds, dependency installation and MongoDB integration.
- Mention validation performed in the PR description.
