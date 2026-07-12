import { migration as registerMigrationFramework } 
    from "./20260712-register-migration-framework.js";
import { migration as addPatientLanguageDefault }
    from "./20260712-add-patient-language-default.js";
export const migrations = [
    registerMigrationFramework,
    addPatientLanguageDefault,
];
