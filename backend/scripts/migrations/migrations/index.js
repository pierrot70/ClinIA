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
import { migration as minimizeClinicalAuditContent }
    from "./20260723-minimize-clinical-audit-content.js";
import { migration as addRefreshTokenFamilyIndexes }
    from "./20260726-add-refresh-token-family-indexes.js";
import { migration as addRefreshTokenSessionIndex }
    from "./20260728-add-refresh-token-session-index.js";
export const migrations = [
    registerMigrationFramework,
    addPatientLanguageDefault,
    expandPatientLanguageOptions,
    sanitizeAuditRequestPaths,
    addPatientSearchIndexes,
    minimizeClinicalAuditContent,
    addRefreshTokenFamilyIndexes,
    addRefreshTokenSessionIndex,
];
