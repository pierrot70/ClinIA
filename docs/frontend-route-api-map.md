# Cartographie frontend des routes, composants, et API

Derniere mise a jour: 2026-04-26

Ce document decrit les composants appeles par les routes declarees dans `frontend/src/App.tsx`, les props visibles au niveau route, les principaux etats internes, les etats globaux accessibles et les API appelees par ces composants.

Note de conformite: les payloads cliniques doivent rester minimises. Aucune donnee patient identifiable ne doit etre envoyee vers l'IA. Les pages de gestion peuvent manipuler des donnees nominatives, mais les appels IA doivent rester separes des identifiants patient.

## Enveloppe Globale

Toutes les routes sont rendues dans `App`.

Composants globaux:
- `Header`: affiche la navigation, le selecteur de langue et les actions utilisateur.
- `Footer`: pied de page global.
- `SecurityBlockingAlert`: affiche un incident bloquant quand le contexte securite en contient un.
- `Routes`: choisit la page selon le path courant.

Etats globaux accessibles:
- `AuthContext`: `status`, `user`, `isAuthenticated`, `login`, `registerSelf`, `logout`, `refreshSession`, `authFetch`, `hasAnyRole`.
- `HomeI18nContext`: `locale`, `strings`, `isTranslating`, `setLocaleFromDropdown`, `setLocaleFromVoice`.
- `SecurityIncidentContext`: `blockingIncident`, `setBlockingIncident`.
- `authService`: conserve l'access token en memoire, le refresh token dans `sessionStorage` sous `clinia_refresh_token`.
- `HomeI18nContext`: conserve la langue UI dans `localStorage` sous `clinia_ui_locale_v3` et peut cacher des traductions home sous `clinia_home_i18n_<lang>_v3`.

API globales appelees hors pages:
- `GET /api/auth/session`: revalidation periodique de session par `AuthContext`.
- `POST /api/auth/refresh`: renouvellement access token avec `{ refreshToken }`.
- `GET /api/auth/app-status`: banniere maintenance globale dans `App`.
- `POST /api/security/incidents/acknowledge`: acknowledgement global si incident bloquant.
- `POST /api/i18n/home-translate`: traduction des chaines home via `HomeI18nContext`.
- `POST /api/translation`: traduction a la demande via `useTranslation`.

## Routes

| Path | Protection | Composant route | Props route | Etat interne principal | Etats globaux | API possibles |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | Public | `CoolifyLandingPage` en production, sinon redirect `/clinical-demo` | Aucune | Aucun etat propre | `HomeI18nContext`, `useTranslation` | `/api/translation`, `/api/i18n/home-translate` |
| `/demo` | Public | `DemoPage` | Aucune | Aucun etat propre | `HomeI18nContext`, `useTranslation` | `/api/translation` |
| `/results` | Public | `Results` | Aucune prop directe; lit query `q` et `location.state` | `sourceMode`, `blockingIncident`, `realAI`, messages incident | `HomeI18nContext`, `useClinicalAnalysis` | `POST /api/ai/analyze`, `POST /api/security/incidents/acknowledge` |
| `/treatment/:id` | Public | `TreatmentDetails` | Param route `id` via `useParams` | Aucun | Donnees locales `hypertensionTreatments` | Aucune |
| `/quick` | Public | `QuickMode` | Aucune | Aucun | Donnees locales `hypertensionTreatments` | Aucune |
| `/patient-summary` | Public | `PatientSummary` page | Aucune | Aucun | Donnees statiques | Aucune |
| `/login` | Public | `LoginPage` | `adminOnly=false` par defaut | `email`, `password`, `registerMode`, `registerRole`, `error`, `loading` | `AuthContext` | Auth: login/register-self/logout |
| `/admin/login` | Public | `AdminLogin` -> `LoginPage` | `adminOnly=true` | Meme etat que `LoginPage` | `AuthContext` | Auth: login/logout |
| `/clinical` | `USER`, `MEDECIN`, `ADMIN`, `SUPERADMIN` | `ProtectedRoute` -> `ClinicalAnalyzePage` | `ProtectedRoute.allowedRoles` | Voir section clinique | `AuthContext`, `HomeI18nContext`, `SecurityIncidentContext` | Analyse IA, commentaires, incidents, traduction |
| `/clinical-demo` | Public | `ClinicalAnalyzePage` | Aucune | Voir section clinique | `HomeI18nContext`, `SecurityIncidentContext` | Analyse IA, lookup commentaires, traduction |
| `/appointments` | `USER`, `MEDECIN`, `ADMIN`, `SUPERADMIN` | `AppointmentsPage` | `ProtectedRoute.allowedRoles` | Creation RDV, recherche patient, specialistes, cliniques, slots | `AuthContext`, `HomeI18nContext` | Appointments, patients, specialists, cliniques |
| `/appointments/list` | `USER`, `MEDECIN`, `ADMIN`, `SUPERADMIN` | `AppointmentsListPage` | `ProtectedRoute.allowedRoles` | Liste RDV, filtres, edition horaire/statut | `AuthContext` | Appointments, patients, specialists |
| `/patients` | `USER`, `MEDECIN`, `ADMIN`, `SUPERADMIN` | `PatientsPage` | `ProtectedRoute.allowedRoles` | Liste patients, filtres, edition/creation, pagination | `AuthContext`, `HomeI18nContext` | Patients |
| `/comments` | Public | `ClinicianCommentsPage` | Aucune | Commentaire, categorie, scope, reponse admin, loading/error/success | `HomeI18nContext`, `authFetch` si session presente | Clinician comments |
| `/cliniques` | `USER`, `MEDECIN`, `ADMIN`, `SUPERADMIN` | `CliniquesPage` | `ProtectedRoute.allowedRoles` | Liste, filtres, formulaire, edition, pagination | `AuthContext`, `HomeI18nContext` | Cliniques |
| `/specialists` | `USER`, `MEDECIN`, `ADMIN`, `SUPERADMIN` | `SpecialistsPage` | `ProtectedRoute.allowedRoles` | Liste, filtres, formulaire, calendrier disponibilites | `AuthContext`, `HomeI18nContext` | Specialists, cliniques |
| `/mock-studio` | `ADMIN`, `SUPERADMIN` | `MockStudio` | `ProtectedRoute.allowedRoles` | Mocks, cle selectionnee, loading/saving/error/info | `AuthContext` | Mocks |
| `/admin/patient-audits` | `ADMIN`, `SUPERADMIN` | `PatientAuditLogsPage` | `ProtectedRoute.allowedRoles` | Logs, filtres, patients optionnels, pagination | `AuthContext` | Patient audit logs, patients |
| `/admin/openai-logs` | `ADMIN`, `SUPERADMIN` | `OpenAILogsPage` | `ProtectedRoute.allowedRoles` | Logs, filtres URL, export CSV, pagination | `AuthContext`, `HomeI18nContext` | OpenAI logs |
| `/admin/users/manage` | `SUPERADMIN` | `UserRegisterPage` | `ProtectedRoute.allowedRoles` | Creation, liste, edition, statut, reset password, suppression | `AuthContext` | Auth users |
| `*` | Public | Redirect `/` | Aucune | Aucun | Router | Aucune |

## Details Par Route

### `/demo` - `DemoPage`

Composants appeles:
- `Link` vers `/login` et `/clinical-demo`.
- Traductions ligne par ligne via `useTranslation`.

Props:
- Aucune prop depuis `App`.

Etat interne:
- Aucun `useState`; contenu construit a partir de `DEMO_STRINGS`.

API:
- `POST /api/translation` via `useTranslation`.

### `/results` - `Results`

Composants appeles:
- `AICard` avec `{ loading, error, text }`.
- `ClinicalDemoResult` avec `{ demoData, sourceMode, realAI, patientDisplayName }`.
- `SecurityBlockingAlert` avec `{ blocking, actionableMessage, acknowledging, onAcknowledge }`.

Entrees:
- Query string `q`, defaut `"Hypertension essentielle"`.
- `location.state.patientDisplayName?: string`.
- `location.state.analysisPayload?: ClinicalPayload`.
- `sessionStorage.clinia_results_payload` peut fournir un payload precedent si `q` correspond.

Etat interne:
- `sourceMode`: `"mock" | "real" | "degraded" | "unknown"`.
- `blockingIncident`, `acknowledgingIncident`, `blockingActionableMessage`, `neutralizedMessage`.
- `realAI`: toggle local hors production, persiste dans `localStorage.clinia_force_real`.
- `requestIdRef`, `realAIRef`.
- `useClinicalAnalysis`: `result`, `loading`, `error`, `errorCode`.

API:
- `POST /api/ai/analyze` via `useClinicalAnalysis`.
- `POST /api/security/incidents/acknowledge` si incident bloquant.

### `/clinical` et `/clinical-demo` - `ClinicalAnalyzePage`

Composants appeles:
- `ClinicalForm` avec `{ onSubmit, loading }`.
- `ClinicalDemoResult` avec `{ demoData, sourceMode, realAI }`.
- `SecurityBlockingAlert`.
- `Link` vers `/comments`.

Etat interne:
- `openaiModel`: `"gpt-4.1-mini" | "gpt-4-0613"`.
- `activeTab`: `"patient" | "clinical"`.
- `apiError`, `blockingIncident`, `acknowledgingIncident`, `blockingActionableMessage`.
- `serviceMode`: `"real" | "mock" | "degraded" | null`.
- `forceReal`: toggle IA reelle hors production, synchronise avec `localStorage.clinia_force_real`.
- `lastPayload`: dernier `ClinicalPayload` soumis.
- Lookup commentaires: `replyLookupName`, `replyLookupCode`, `replyLookupLoading`, `replyLookupError`, `replyLookupItems`.
- `showTranslationError`.

Etat global:
- `HomeI18nContext.locale`.
- `SecurityIncidentContext`.
- Auth seulement quand la route protegee `/clinical` est utilisee.

API:
- `POST /api/ai/analyze`.
- `GET /api/clinician-comments/lookup-replies`.
- `POST /api/security/incidents/acknowledge`.
- `POST /api/translation`.

### `ClinicalForm`

Props:
- `onSubmit(payload: ClinicalPayload): void`.
- `loading: boolean`.
- `warningMessage?: string`.
- `highlightFields?: string[]`.
- `initialData?: ClinicalPayload | null`.

Etat interne:
- `form: ClinicalPayload`.
- `selectedExampleCase`.
- `listInputs`: versions texte de `symptoms`, `medical_history`, `current_medications`.

Stockage local:
- `localStorage.clinia_last_clinical_payload` pour conserver temporairement le formulaire.

Payload soumis:
```ts
{
  age: number,
  sex: "male" | "female" | "other",
  diagnosis?: string,
  weight?: number,
  height?: number,
  blood_pressure?: { systolic?: number, diastolic?: number },
  symptoms: string[],
  medical_history: string[],
  current_medications: string[]
}
```

### `/appointments` - `AppointmentsPage`

Etat interne:
- Champs creation: `insuranceNumber`, `patientId`, `selectedPatient`, `specialist`, `date`, `time`, `reason`, `priority`.
- Slots: `availableSlots`, `slotsLoading`.
- Recherche patients: `searchNom`, `searchPrenom`, `searchTelephone`, `patients`, `patientsLoading`, `patientsError`, `hasSearchedPatients`, `searchTimer`.
- Donnees reference: `specialists`, `cliniques`, loading/error associes.
- Soumission: `loading`, `apiError`, `success`.

API:
- `GET /api/patients`.
- `GET /api/specialists`.
- `GET /api/cliniques`.
- `GET /api/appointments/slots`.
- `POST /api/appointments`.

### `/appointments/list` - `AppointmentsListPage`

Etat interne:
- `appointments`, `loading`, `error`, `busyIds`.
- Donnees reference: `patients`, `specialists`.
- Edition: `editingId`, `editDate`, `editTime`, `editSpecialist`, `editOriginalDate`, `editOriginalTime`, `editSlots`, `editSlotsLoading`.
- Feedback: `recentlyUpdatedId`, `toast`.
- Pagination et filtres: `page`, `totalPages`, `ramq`, `specialist`, `status`.

API:
- `GET /api/appointments`.
- `GET /api/patients`.
- `GET /api/specialists`.
- `GET /api/appointments/slots`.
- `PATCH /api/appointments/:id/schedule`.
- `PATCH /api/appointments/:id/status`.

### `/patients` - `PatientsPage`

Etat interne:
- `patients`, `loading`, `error`, `busyIds`.
- Pagination: `page`, `totalPages`.
- Filtres: `filterNom`, `filterPrenom`, `filterAddresse`, `filterTelephone`, `filterRamq`.
- Tri: `sortBy`, `sortDir`.
- Formulaire: `editingId`, `form`, `viewMode`.

API:
- `GET /api/patients`.
- `POST /api/patients`.
- `PATCH /api/patients/:id`.
- `DELETE /api/patients/:id`.

### `/comments` - `ClinicianCommentsPage`

Etat interne:
- `scope`: `"own" | "all"`.
- `category`, `categoryFilter`, `comment`.
- `guestDisplayName`, `trackingCode`.
- `items`, `availableActorUsernames`, `actorUsernameFilter`.
- Reponse admin: `selectedCommentId`, `replyMessage`.
- `loading`, `submitting`, `replying`, `error`, `success`.

Stockage local:
- Le flux invité peut utiliser `clinia_comment_tracking` pour retrouver nom/code de suivi ailleurs dans l'app.

API:
- `GET /api/clinician-comments`.
- `POST /api/clinician-comments`.
- `POST /api/clinician-comments/:commentId/reply`.

### `/cliniques` - `CliniquesPage`

Etat interne:
- `cliniques`, `loading`, `error`, `busyIds`.
- Pagination: `page`, `totalPages`, `totalCount`.
- Filtres: `filterNom`, `filterRue`, `filterCodePostal`.
- Formulaire: `editingId`, `form`, `viewMode`.

API:
- `GET /api/cliniques`.
- `POST /api/cliniques`.
- `PATCH /api/cliniques/:id`.
- `DELETE /api/cliniques/:id`.

Note: les donnees metier originales comme le nom d'une clinique doivent rester telles quelles. On traduit les libelles UI, pas les noms d'etablissement.

### `/specialists` - `SpecialistsPage`

Etat interne:
- `specialists`, `loading`, `error`, `busyIds`.
- Pagination: `page`, `totalPages`.
- Options reference: `cliniqueOptions`.
- Selection visuelle: `highlightedId`.
- Filtres: `filterNom`, `filterPrenom`, `filterNumero`, `filterClinique`.
- Formulaire: `editingId`, `form`, `viewMode`.
- Disponibilites: `monthKey`, `activeDay`, `lastClickedSlot`.

API:
- `GET /api/specialists`.
- `POST /api/specialists`.
- `PATCH /api/specialists/:id`.
- `DELETE /api/specialists/:id`.
- `GET /api/cliniques` pour les options de clinique.

### `/admin/openai-logs` - `OpenAILogsPage`

Etat interne:
- `searchParams` comme source URL des filtres.
- `logs`, `loading`, `exporting`, `error`, `exportError`.
- Pagination: `totalPages`, `total`.
- Export: `exportTruncated`.
- `draftFilters`.

API:
- `GET /api/openai-logs`.
- `GET /api/openai-logs/export.csv`.

### `/admin/patient-audits` - `PatientAuditLogsPage`

Etat interne:
- `logs`, `patientOptions`.
- `loading`, `patientsLoading`, `error`.
- Pagination: `page`, `totalPages`, `total`.
- Filtres: `action`, `patientSearch`, `patientId`, `actorUserId`, `startDate`, `endDate`.

API:
- `GET /api/patients/audit-logs`.
- `GET /api/patients` pour rechercher les patients affiches comme options.

### `/admin/users/manage` - `UserRegisterPage`

Etat interne:
- Creation: `username`, `email`, `password`, `role`, `saving`.
- Liste: `users`, `loadingUsers`, `usersPage`, `usersTotalPages`, `usersTotal`.
- Filtres: `usersSearchInput`, `usersRoleFilter`, `appliedUsersSearch`, `appliedUsersRoleFilter`.
- Edition: `selectedUserId`, `editUsername`, `editEmail`, `editRole`, `resetPassword`, `editSaveStatus`, `editSaveMessage`.
- Feedback: `error`, `success`.

API:
- `GET /api/auth/users`.
- `POST /api/auth/register`.
- `PATCH /api/auth/users/:id`.
- `PATCH /api/auth/users/:id/status`.
- `POST /api/auth/users/:id/reset-password`.
- `DELETE /api/auth/users/:id`.

### `/mock-studio` - `MockStudio`

Etat interne:
- `mocks`, `selectedKey`, `loading`, `saving`, `error`, `info`.

API:
- `GET /api/mocks`.
- `PUT /api/mocks`.

## Catalogue Des API Frontend

Les reponses metier suivent generalement le contrat:

```ts
type ApiResponse<T> =
  | { data: T, meta: { source: "real" | "mock" | "degraded", model: string } }
  | { error: { code: string, message: string, retryable: boolean, action?: string }, blocking?: SecurityIncidentBlockingData };
```

Certaines API historiques retournent une forme specifique; le frontend les normalise localement.

### Auth

`POST /api/auth/login`

Payload:
```ts
{ email: string, password: string }
```

Reponse attendue:
```ts
{
  data?: { accessToken?: string, token?: string, refreshToken?: string, user?: { id?: string, _id?: string, email?: string, username?: string, role?: string } },
  accessToken?: string,
  token?: string,
  refreshToken?: string,
  user?: { id?: string, _id?: string, email?: string, username?: string, role?: string },
  error?: string | { code?: string, message?: string },
  message?: string
}
```

`POST /api/auth/register-self`

Payload:
```ts
{ email: string, password: string, role?: "USER" | "MEDECIN" | "ADMIN" | "SUPERADMIN" }
```

Reponse: creation du compte, puis le frontend appelle `POST /api/auth/login`.

`POST /api/auth/refresh`

Payload:
```ts
{ refreshToken: string }
```

Reponse attendue: meme forme que login, avec nouvel `accessToken`.

`POST /api/auth/logout`

Payload:
```ts
{ refreshToken?: string }
```

Reponse: non exploitee; le frontend efface la session locale quoi qu'il arrive.

`GET /api/auth/session`

Payload: aucun.

Reponse: statut HTTP suffisant pour confirmer ou couper la session.

### Gestion Utilisateurs

`GET /api/auth/users?page=&limit=&search=&role=`

Reponse attendue:
```ts
{
  data: {
    users: Array<{ id: string, username: string, email?: string, role: string, isActive: boolean }>,
    pagination: { page: number, limit: number, total: number, totalPages: number }
  }
}
```

`POST /api/auth/register`

Payload:
```ts
{ username: string, email?: string, password: string, role: "MEDECIN" | "ADMIN" | "SUPERADMIN" }
```

`PATCH /api/auth/users/:id`

Payload:
```ts
{ username: string, email: string | null, role: "MEDECIN" | "ADMIN" | "SUPERADMIN" }
```

`PATCH /api/auth/users/:id/status`

Payload:
```ts
{ isActive: boolean }
```

`POST /api/auth/users/:id/reset-password`

Payload:
```ts
{ newPassword: string }
```

`DELETE /api/auth/users/:id`

Payload: aucun.

### Analyse Clinique IA

`POST /api/ai/analyze`

Payload:
```ts
{
  age: number,
  sex: "male" | "female" | "other",
  diagnosis?: string,
  weight?: number,
  height?: number,
  blood_pressure?: { systolic?: number, diastolic?: number },
  symptoms: string[],
  medical_history: string[],
  current_medications: string[],
  forceReal?: boolean,
  openaiModel?: string
}
```

Reponse attendue:
```ts
{
  data: {
    diagnosis: { suspected: string, certainty_level: "low" | "moderate" | "high", justification: string },
    treatments: Array<{
      name: string,
      indication: string,
      dosage: string,
      duration: string,
      contraindications: string[],
      monitoring: string[],
      evidence_level: "A" | "B" | "C"
    }>,
    alternatives: Array<{ name: string, reason: string }>,
    red_flags: string[],
    patient_summary: { plain_language: string, clinical_language: string },
    meta: { model: string, confidence_score: number, source?: "real" | "mock" | "degraded" },
    clinical_summary?: unknown,
    recommendations?: unknown,
    initial_evaluation_recommendations?: unknown,
    treatment_options?: unknown,
    follow_up_and_monitoring?: unknown,
    other_ai_fields?: Record<string, unknown>
  },
  meta: { source: "real" | "mock" | "degraded", model: string }
}
```

Echec possible:
```ts
{
  error: { code: "AI_UNAVAILABLE" | "AI_DEGRADED" | "INVALID_INPUT" | "SECURITY_INCIDENT_BLOCKING" | "INTERNAL_ERROR", message: string, retryable: boolean },
  blocking?: SecurityIncidentBlockingData
}
```

### Incidents Securite

`POST /api/security/incidents/acknowledge`

Payload:
```ts
{ incidentId: string, action: "J'ai lu et compris", context: Record<string, unknown> }
```

Reponse attendue:
```ts
{
  data: {
    incidentId: string,
    acknowledged: boolean,
    acknowledgedAt: string,
    action: string,
    context: Record<string, unknown>
  },
  meta: { source: "real" | "mock" | "degraded", model: string }
}
```

### Patients

`GET /api/patients`

Query:
```ts
{ page?: number, limit?: number, nom?: string, prenom?: string, num_assurance_maladie?: string, telephone?: string, addresse?: string, sortBy?: string, sortDir?: "asc" | "desc" }
```

Reponse attendue:
```ts
{
  data: {
    data: Patient[],
    meta: { page: number, limit: number, total: number, totalPages: number, source: string, model: string }
  }
}
```

`POST /api/patients`, `PATCH /api/patients/:id`

Payload:
```ts
{
  nom: string,
  prenom: string,
  num_assurance_maladie?: string,
  addresse?: string,
  telephone?: string,
  courriel?: string,
  created_by_reference?: string,
  texto?: boolean,
  lat?: number,
  long?: number,
  secure_request_profile?: {
    objective?: string,
    sex?: string,
    age?: string,
    current_medications?: string,
    selected_document_ids?: string[],
    clinicalScope?: string,
    ageGroup?: string,
    symptomProfile?: string,
    cancerType?: string,
    duration?: string,
    severity?: string,
    redFlagStatus?: string,
    comorbidityContext?: string,
    clinicalNotes?: string,
    privacyAttestation?: boolean,
    lastRequestedAt?: string
  }
}
```

Reponse attendue: `ApiResponse<Patient>`.

`DELETE /api/patients/:id`: payload aucun, reponse `ApiResponse<Patient>`.

`GET /api/patients/:id/secure-request-documents`: payload aucun, reponse `ApiResponse<PatientSecureRequestDocument[]>`.

### Audits Patient

`GET /api/patients/audit-logs`

Query:
```ts
{ page?: number, limit?: number, action?: "PATIENT_CREATE" | "PATIENT_UPDATE" | "PATIENT_DELETE", patientId?: string, actorUserId?: string, startDate?: string, endDate?: string }
```

Reponse attendue:
```ts
{
  data: {
    logs: Array<{
      id: string,
      action: string,
      outcome: "SUCCESS" | "FAILED",
      actorUserId: string | null,
      actorUsernameMasked: string,
      actorRole: string | null,
      ip: string | null,
      patientId: string | null,
      changedFields: string[],
      requestPath: string | null,
      context: Record<string, unknown> | null,
      timestamp: string
    }>,
    pagination: { page: number, limit: number, total: number, totalPages: number }
  }
}
```

### Rendez-vous

`GET /api/appointments`

Query:
```ts
{ page: number, limit: number, specialist?: string, status?: "scheduled" | "cancelled" | "completed", patientInsuranceNumber?: string }
```

`POST /api/appointments`

Payload:
```ts
{ patient: string, specialist: string, date: string, time: string, reason?: string, priority: "normal" | "urgent" }
```

`GET /api/appointments/slots`

Query:
```ts
{ specialist: string, date: string, patient?: string }
```

Reponse attendue:

```ts
ApiResponse<{
  slots: string[];
  existingAppointmentTimes: string[];
  maximumAppointmentsReached: boolean;
}>
```

Lorsque `patient` est fourni, il est limité au dossier autorisé pour
l'utilisateur connecté. Les créneaux du spécialiste déjà réservés, les heures
antérieures au rendez-vous existant du patient avec ce spécialiste et les
créneaux passés ne sont pas retournés.

`DELETE /api/appointments/:id`: annule un rendez-vous, reponse `ApiResponse<Appointment>`.

`PATCH /api/appointments/:id/status`

Payload:
```ts
{ status: "scheduled" | "cancelled" | "completed" }
```

`PATCH /api/appointments/:id/schedule`

Payload:
```ts
{ date: string, time: string }
```

### Cliniques

`GET /api/cliniques`

Query:
```ts
{ page?: number, limit?: number, rue?: string, code_postal?: string, nom?: string }
```

`POST /api/cliniques`, `PATCH /api/cliniques/:id`

Payload:
```ts
{ nom: string, num_civique: string, rue: string, code_postal: string, lat?: number, long?: number, telephone?: string, courriel?: string }
```

`DELETE /api/cliniques/:id`: payload aucun.

### Specialistes

`GET /api/specialists`

Query:
```ts
{ page?: number, limit?: number, nom?: string, prenom?: string, numero_medecin?: string, telephone?: string, email?: string, clinique_associer?: string }
```

`POST /api/specialists`, `PATCH /api/specialists/:id`

Payload:
```ts
{ nom: string, prenom: string, numero_medecin: string, telephone?: string, email?: string, texto?: boolean, clinique_associer?: string | null, specialite?: string, disponibilites?: string[] }
```

`DELETE /api/specialists/:id`: payload aucun.

### Commentaires Cliniciens

`GET /api/clinician-comments`

Query:
```ts
{ scope: "own" | "all", actorUsername?: string, category?: "BUG" | "SUGGESTION" | "URGENT" | "INCOMPREHENSION" }
```

Reponse attendue:
```ts
{
  data: {
    items: ClinicianComment[],
    pagination?: { page: number, limit: number, total: number, totalPages: number },
    scope?: "own" | "all",
    availableActorUsernames?: string[]
  }
}
```

`POST /api/clinician-comments`

Payload:
```ts
{ comment: string, category: "BUG" | "SUGGESTION" | "URGENT" | "INCOMPREHENSION", guestDisplayName?: string, trackingCode?: string }
```

`GET /api/clinician-comments/lookup-replies`

Query:
```ts
{ actorUsername: string, trackingCode: string }
```

`POST /api/clinician-comments/:commentId/reply`

Payload:
```ts
{ message: string }
```

### OpenAI Logs

`GET /api/openai-logs`

Query:
```ts
{
  page?: number,
  limit?: number,
  startDate?: string,
  endDate?: string,
  action?: string,
  outcome?: string,
  actorUserId?: string,
  actorUsernameMasked?: string,
  actorRole?: string,
  ip?: string,
  requestPath?: string,
  transport?: string,
  model?: string,
  payloadHash?: string,
  payloadSizeBytes?: string,
  dataClassification?: string,
  acknowledgmentIncidentId?: string,
  neutralized?: string,
  upstreamRequestId?: string,
  errorCode?: string
}
```

Reponse attendue:
```ts
{
  data: {
    logs: OpenAILogEntry[],
    pagination: { page: number, limit: number, total: number, totalPages: number }
  }
}
```

`GET /api/openai-logs/export.csv`

Query: memes filtres que `GET /api/openai-logs`.

Reponse attendue:
- Body CSV sous forme `Blob`.
- Header `X-Export-Truncated: true` si export tronque.

### Traductions UI

`POST /api/translation`

Payload traduction:
```ts
{ text: string, targetLang: string, namespace?: string, sourceLocale?: string, openaiModel?: string }
```

Payload sauvegarde forcee:
```ts
{ text: string, translated: string, targetLang: string, namespace?: string, sourceLocale?: string, forceSave: true }
```

Reponse attendue:
```ts
{ translation: string }
```

`POST /api/i18n/home-translate`

Payload:
```ts
{ targetLang: string, sourceStrings: HomeStrings }
```

Reponse attendue:
```ts
{
  data: HomeStrings,
  meta?: {
    voiceAck?: string,
    lang?: string,
    voicePrompts?: { dictationInstruction?: string }
  }
}
```

### Mocks

`GET /api/mocks`

Payload: aucun.

Reponse attendue:
```ts
Record<string, { match: string[], patient_summary: string, treatments: Array<{ name: string, justification: string, contraindications: string[], efficacy: number }> }>
```

`PUT /api/mocks`

Payload: le `Record<string, MockEntry>` complet modifie dans `MockStudio`.

Reponse: statut HTTP `2xx`; le frontend n'exploite pas de payload metier.

## Points D'Audit

- Les pages routees depuis `App.tsx` ne recoivent presque jamais de props metier directes; les entrees viennent surtout de React Router, des contextes et des services.
- Les pages de gestion traduisent les libelles UI, pas les donnees originales venant de la base.
- `authFetch` est le point central pour injecter le JWT et forcer le refresh.
- Les appels IA passent par `POST /api/ai/analyze`; c'est l'endroit critique pour verifier la minimisation des donnees.
- Les incidents securite peuvent transformer une reponse API en blocage UI via `SecurityIncidentBlockingData`.
