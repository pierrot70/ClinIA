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
import { migration as scopePatientIdentifiersByOwner }
    from "./20260729-scope-patient-identifiers-by-owner.js";
import { migration as dropLegacyGlobalPatientInsuranceIndex }
    from "./20260729-drop-legacy-global-patient-insurance-index.js";
import { migration as dropGlobalPatientInsuranceIndex }
    from "./20260730-drop-global-patient-insurance-index.js";
import { migration as dropOutOfOrderPatientSearchIndexes }
    from "./20260730-drop-out-of-order-patient-search-indexes.js";
export const migrations = [
    registerMigrationFramework,
    addPatientLanguageDefault,
    expandPatientLanguageOptions,
    sanitizeAuditRequestPaths,
    addPatientSearchIndexes,
    minimizeClinicalAuditContent,
    addRefreshTokenFamilyIndexes,
    addRefreshTokenSessionIndex,
    scopePatientIdentifiersByOwner,
    dropLegacyGlobalPatientInsuranceIndex,
    dropGlobalPatientInsuranceIndex,
    dropOutOfOrderPatientSearchIndexes,
];
