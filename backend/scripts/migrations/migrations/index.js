import { migration as registerMigrationFramework } 
    from "./20260712-register-migration-framework.js";
import { migration as addPatientLanguageDefault }
    from "./20260712-add-patient-language-default.js";
import { migration as expandPatientLanguageOptions }
    from "./20260712-expand-patient-language-options.js";
export const migrations = [
    registerMigrationFramework,
    addPatientLanguageDefault,
    expandPatientLanguageOptions,
];
