# ClinIA Global Copilot Instructions

## Cloud Safety Policy (Mandatory)
- Any non-secure content detected before or after cloud transmission (for example patient identifiers: name, RAMQ, phone number, email, address, date of birth) must be surfaced in the UI as a blocking alert.
- The clinician must perform an explicit acknowledgment action before continuing (for example `J'ai lu et compris`).
- The acknowledgment must be recorded with timestamp and incident context.
- Never hide this class of error silently; always return a clear, actionable message for the user.
