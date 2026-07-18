import { migration as registerMigrationFramework } 
    from "./20260712-register-migration-framework.js";
import { migration as addPatientLanguageDefault }
    from "./20260712-add-patient-language-default.js";
import { migration as expandPatientLanguageOptions }
    from "./20260712-expand-patient-language-options.js";
import { migration as sanitizeAuditRequestPaths }
    from "./20260718-sanitize-audit-request-paths.js";
import { migration as addPatientSearchIndexes }
    from "./20260718-add-patient-search-indexes.js";
export const migrations = [
    registerMigrationFramework,
    addPatientLanguageDefault,
    expandPatientLanguageOptions,
    sanitizeAuditRequestPaths,
    addPatientSearchIndexes,
];
