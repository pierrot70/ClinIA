export const UI_LABELS_FR = {
    // App.tsx - page d'accueil Coolify et messages globaux de statut.
    app: {
        // App.tsx / CoolifyLandingPage - cartes de navigation visibles en production.
        landing: {
            title: "ClinIA",
            subtitle:
                "Choisissez votre point d'entrée. La démo clinique est accessible sans connexion. Les accès médecin et admin utilisent les pages de connexion dédiées.",
            clinicalDemoTitle: "Démo clinique",
            clinicalDemoBody: "Accéder directement à la démonstration ClinIA.",
            doctorLoginTitle: "Connexion médecin",
            doctorLoginBody: "Ouvrir la page de connexion utilisateur.",
            adminLoginTitle: "Connexion admin",
            adminLoginBody: "Ouvrir la page de connexion administrateur.",
        },
        // App.tsx - bannière globale lorsque le mode maintenance est actif.
        status: {
            maintenance:
                "Maintenance en cours. L'application est temporairement arrêtée pour les usagers non SUPERADMIN.",
        },
    },
    // ClinicalAnalyzePage.tsx - expérience /clinical-demo.
    clinicalDemo: {
        // ClinicalAnalyzePage.tsx - bloc commentaires et consultation des réponses.
        comments: {
            leaveComment: "Laisser un commentaire",
            replyLookupTitle: "Voir les réponses à mes commentaires",
            replyLookupDescription:
                "Entrez exactement le nom ou pseudonyme utilisé lors du commentaire, ainsi que votre code de suivi. Si votre navigateur a conservé ces informations, elles sont pré-remplies automatiquement.",
            namePlaceholder: "Nom ou pseudonyme",
            trackingCodePlaceholder: "Code de suivi",
            searchLoading: "Recherche...",
            viewReplies: "Voir mes réponses",
            noRepliesFound:
                "Aucune réponse trouvée pour ces informations de suivi.",
            commentCreatedAtPrefix: "Commentaire du",
            replyFromPrefix: "Réponse de",
            replyFromSeparator: "le",
        },
    },
    // ClinicianCommentsPage.tsx - page /comments.
    commentsPage: {
        categories: {
            bug: "Bug",
            suggestion: "Suggestion",
            urgent: "Urgence",
            incomprehension: "Incompréhension",
        },
        header: {
            title: "Commentaires médecins",
            description:
                "Utilisez cet espace pour laisser des commentaires de support ou de suivi. N'insérez jamais de données permettant d'identifier un patient. Les emails, téléphones, numéros d'assurance maladie, SSN/NAS et certaines valeurs libellées sont obfusqués automatiquement avant sauvegarde.",
            guestHint:
                "Vous pouvez laisser un commentaire sans connexion. Ajoutez simplement votre nom ou un pseudonyme professionnel.",
        },
        form: {
            newCommentLabel: "Nouveau commentaire",
            nameLabel: "Nom ou pseudonyme",
            namePlaceholder: "Exemple: dr.lasante",
            trackingCodeLabel: "Code de suivi",
            trackingCodePlaceholder:
                "Généré automatiquement au premier commentaire",
            trackingCodeHint:
                "Laissez vide pour recevoir un nouveau code de suivi, ou réutilisez votre code actuel pour regrouper vos commentaires.",
            categoryLabel: "Type de commentaire",
            commentPlaceholder:
                "Exemple: Le module de rendez-vous affiche une erreur au moment de confirmer l'horaire. Ne pas inclure de nom de patient, numéro d'assurance maladie, téléphone ou email.",
            authenticatedPrivacyHint:
                "Votre nom d'usager et la date/heure seront sauvegardés avec le commentaire obfusqué.",
            guestPrivacyHint:
                "Votre nom ou pseudonyme, la date/heure et le commentaire obfusqué seront sauvegardés.",
            submitting: "Enregistrement...",
            submit: "Enregistrer le commentaire",
        },
        status: {
            saved: "Commentaire enregistré.",
            savedWithRedaction:
                "Commentaire enregistré avec obfuscation automatique des identifiants détectés.",
            trackingCodePrefix: "Code de suivi:",
            selectCommentBeforeReply:
                "Sélectionnez un commentaire avant de répondre.",
            replySaved: "Réponse enregistrée.",
        },
        list: {
            title: "Commentaires sauvegardés",
            description:
                "Les commentaires sont affichés tels qu'ils ont été sauvegardés après obfuscation.",
            ownScope: "Mes commentaires",
            allScope: "Tous les commentaires",
            allActors: "Tous les noms ou pseudonymes",
            allCategories: "Toutes les catégories",
            loginRequired:
                "Connectez-vous pour consulter l'historique des commentaires.",
            loading: "Chargement des commentaires...",
            empty: "Aucun commentaire enregistré pour le moment.",
            selectedCommentLabel: "Sélection du commentaire",
            selectedCommentPreviewTitle: "Commentaire sélectionné",
            replyPlaceholder:
                "Écrire une réponse au commentaire sélectionné...",
            replySubmit: "Répondre au commentaire",
            redactionSuffix: "obfuscation(s)",
        },
    },
    // AppointmentsPage.tsx - page /appointments, création de rendez-vous.
    appointmentsPage: {
        title: "Créer un rendez-vous",
        tabs: {
            create: "Création",
            list: "Voir la liste",
        },
        patientSearch: {
            insurancePlaceholder: "Numéro d'assurance maladie (auto)",
            title: "Rechercher un patient existant",
            lastNamePlaceholder: "Nom",
            firstNamePlaceholder: "Prénom",
            phonePlaceholder: "Téléphone",
            loading: "Recherche...",
            submit: "Rechercher",
            empty: "Aucun patient trouvé.",
        },
        specialist: {
            loading: "Chargement des spécialistes...",
            choose: "Choisir un spécialiste *",
            nearestClinicMissing: "Clinique la plus proche introuvable",
            selectPatient: "Sélectionnez un patient",
            noneInNearestClinic:
                "Aucun spécialiste disponible dans la clinique la plus proche.",
            missingCoordinates:
                "Coordonnées manquantes pour déterminer la clinique la plus proche.",
        },
        priority: {
            label: "Priorité",
            normal: "Normal",
            urgent: "Urgent",
        },
        slots: {
            label: "Créneaux disponibles",
            loading: "Chargement...",
        },
        reasonPlaceholder: "Motif (optionnel)",
        action: {
            loading: "Création...",
            submit: "Créer le rendez-vous",
            success: "Rendez-vous créé avec succès.",
        },
    },
    // PatientsPage.tsx - page /patients, création et recherche de patients.
    patientsPage: {
        title: "Patients",
        tabs: {
            create: "Créer un patient",
            search: "Rechercher les patients",
        },
        validation: {
            invalidServerResponse:
                "Réponse serveur invalide (pagination manquante).",
            invalidLatitude: "Latitude invalide.",
            invalidLongitude: "Longitude invalide.",
            requiredName: "Nom et prénom sont requis.",
            invalidCoordinates: "Coordonnées invalides.",
            deleteConfirm: "Supprimer ce patient définitivement ?",
        },
        form: {
            editTitle: "Modifier un patient",
            createTitle: "Créer un patient",
            firstNamePlaceholder: "Prénom *",
            lastNamePlaceholder: "Nom *",
            ramqPlaceholder: "Numéro d'assurance maladie (optionnel)",
            phonePlaceholder: "Téléphone (optionnel)",
            emailPlaceholder: "Courriel (optionnel)",
            addressPlaceholder: "Adresse (optionnel)",
            latitudePlaceholder: "Latitude (optionnel)",
            longitudePlaceholder: "Longitude (optionnel)",
            smsEnabled: "SMS activé",
            save: "Enregistrer",
            create: "Créer",
            cancel: "Annuler",
        },
        search: {
            title: "Recherche",
            lastNamePlaceholder: "Nom",
            firstNamePlaceholder: "Prénom",
            addressPlaceholder: "Adresse",
            phonePlaceholder: "Téléphone",
            ramqPlaceholder: "Numéro assurance maladie",
            empty: "Aucun patient trouvé.",
        },
        table: {
            lastName: "Nom",
            firstName: "Prénom",
            address: "Adresse",
            phone: "Téléphone",
            ramq: "Numéro assurance maladie",
            actions: "Actions",
            loading: "Chargement...",
            createAppointment: "Créer rendez-vous",
            edit: "Éditer",
            delete: "Supprimer",
        },
        pagination: {
            previous: "Précédent",
            next: "Suivant",
            pagePrefix: "Page",
            pageSeparator: "/",
        },
    },
    // CliniquesPage.tsx - page /cliniques, création et recherche d'établissements.
    cliniquesPage: {
        header: {
            title: "Gestion des établissements",
            description:
                "Créez, modifiez ou supprimez les établissements suivis par ClinIA.",
        },
        tabs: {
            create: "Créer une clinique",
            search: "Rechercher les cliniques",
        },
        validation: {
            requiredFields:
                "Les champs 'nom', 'num_civique', 'rue' et 'code_postal' sont requis.",
            invalidLatitude: "Latitude invalide.",
            invalidLongitude: "Longitude invalide.",
        },
        filters: {
            title: "Filtres",
            nameLabel: "Nom",
            namePlaceholder: "Ex: Clinique Mont-Royal",
            streetLabel: "Rue",
            streetPlaceholder: "Ex: Rue Saint-Denis",
            postalCodeLabel: "Code postal",
            postalCodePlaceholder: "Ex: H2X 1S1",
        },
        table: {
            name: "Nom",
            address: "Adresse",
            postalCode: "Code postal",
            phone: "Téléphone",
            email: "Courriel",
            latitude: "Latitude",
            longitude: "Longitude",
            actions: "Actions",
            empty: "Aucune clinique trouvée.",
            edit: "Modifier",
            delete: "Supprimer",
        },
        summary: {
            empty: "Aucune clinique enregistrée",
            singularSuffix: "clinique",
            pluralSuffix: "cliniques",
        },
        form: {
            editTitle: "Modifier une clinique",
            createTitle: "Nouvelle clinique",
            nameLabel: "Nom de la clinique",
            civicNumberLabel: "Numéro civique",
            streetLabel: "Rue",
            postalCodeLabel: "Code postal",
            phoneLabel: "Téléphone",
            emailLabel: "Courriel",
            latitudeLabel: "Latitude",
            longitudeLabel: "Longitude",
            save: "Enregistrer",
            cancel: "Annuler",
        },
        pagination: {
            loading: "Chargement...",
            previous: "Précédent",
            next: "Suivant",
            pagePrefix: "Page",
            pageSeparator: "/",
        },
    },
    // SpecialistsPage.tsx - page /specialists, création et recherche de spécialistes.
    specialistsPage: {
        title: "Spécialistes",
        tabs: {
            create: "Créer un spécialiste",
            search: "Rechercher les spécialistes",
        },
        validation: {
            invalidServerResponse:
                "Réponse serveur invalide (pagination manquante).",
            availabilityRequiresDateAndSlot:
                "Chaque disponibilité doit contenir une date et au moins un créneau.",
            invalidAvailabilityDates:
                "Les dates de disponibilité doivent être valides.",
            invalidAvailabilityHours:
                "Les heures de disponibilité doivent être valides.",
            invalidAvailabilityAlignment:
                "Les heures doivent être alignées sur 15 minutes.",
            availabilityInPast:
                "Les disponibilités ne peuvent pas être dans le passé.",
            overlappingAvailability:
                "Les disponibilités ne doivent pas se chevaucher.",
            availabilityRequiresSlot:
                "Chaque disponibilité doit contenir au moins un créneau.",
            requiredIdentity:
                "Nom, prénom et numéro de médecin sont requis.",
            invalidAvailability: "Disponibilités invalides.",
            deleteConfirm: "Supprimer ce spécialiste définitivement ?",
        },
        form: {
            editTitle: "Modifier un spécialiste",
            createTitle: "Créer un spécialiste",
            firstNamePlaceholder: "Prénom *",
            lastNamePlaceholder: "Nom *",
            doctorNumberPlaceholder: "Numéro de médecin *",
            phonePlaceholder: "Téléphone (automatique)",
            emailPlaceholder: "Courriel (automatique)",
            noClinic: "Aucune clinique",
            noSpecialty: "Aucune spécialité",
            smsEnabled: "SMS activé",
            availabilityTitle: "Disponibilités (jours du mois)",
            targetMonth: "Mois ciblé",
            selectDaysHint: "Sélectionnez les jours à activer.",
            noDaySelected: "Aucun jour sélectionné.",
            chooseRangePrefix: "Choisir une plage pour",
            slotHelp:
                "Cliquez pour activer/désactiver les créneaux de 15 minutes (shift pour une plage).",
            multipleSlotsHint:
                "Cliquez plusieurs créneaux pour créer une liste (ex: 14:45, 16:15).",
            noSlot: "Aucun créneau",
            editSlot: "Modifier",
            removeDay: "Retirer",
            isoHint:
                "Les créneaux sont générés par pas de 15 minutes et sauvegardés en ISO.",
            save: "Enregistrer",
            create: "Créer",
            cancel: "Annuler",
        },
        search: {
            title: "Recherche",
            lastNamePlaceholder: "Nom",
            firstNamePlaceholder: "Prénom",
            doctorNumberPlaceholder: "Numéro de médecin",
            allClinics: "Toutes les cliniques",
        },
        table: {
            lastName: "Nom",
            firstName: "Prénom",
            doctorNumber: "Numéro médecin",
            specialty: "Spécialité",
            clinic: "Clinique",
            phone: "Téléphone",
            email: "Courriel",
            availability: "Disponibilités",
            actions: "Actions",
            loading: "Chargement...",
            empty: "Aucun spécialiste trouvé.",
            edit: "Éditer",
            delete: "Supprimer",
        },
        pagination: {
            previous: "Précédent",
            next: "Suivant",
            pagePrefix: "Page",
            pageSeparator: "/",
        },
        months: {
            january: "Janvier",
            february: "Février",
            march: "Mars",
            april: "Avril",
            may: "Mai",
            june: "Juin",
            july: "Juillet",
            august: "Août",
            september: "Septembre",
            october: "Octobre",
            november: "Novembre",
            december: "Décembre",
        },
    },
    // OpenAILogsPage.tsx et OpenAILogsModal.tsx - consultation des journaux OpenAI anonymisés.
    openAiLogs: {
        title: "OpenAI logs",
        description:
            "Consultez les requêtes anonymisées envoyées à OpenAI, avec filtres persistants dans l'URL et export CSV basé sur les mêmes critères.",
        modalDescription:
            "Consultation en lecture seule des envois anonymisés vers OpenAI.",
        openDedicatedPage: "Ouvrir la page dédiée",
        queryTimePrefix: "Temps requête:",
        close: "Fermer",
        filters: {
            action: "Action",
            result: "Résultat",
            maskedUsername: "Nom d'utilisateur masqué",
            role: "Rôle",
            actorUserId: "ID utilisateur acteur",
            ip: "IP",
            requestPath: "Chemin de requête",
            transport: "Transport",
            model: "Modèle",
            payloadHash: "Empreinte de charge utile",
            payloadSizeBytes: "Taille de charge utile en octets",
            classification: "Classification",
            incidentAckId: "ID d'accusé d'incident",
            neutralized: "Neutralisé",
            upstreamRequestId: "ID de requête amont",
            errorCode: "Code d'erreur",
            startDate: "Date début",
            endDate: "Date fin",
            all: "Tous",
            allFeminine: "Toutes",
        },
        actions: {
            search: "Rechercher",
            recentClinicalErrors:
                "Afficher seulement les erreurs cliniques récentes",
            refresh: "Actualiser",
            reset: "Réinitialiser",
            exportCsv: "Exporter CSV",
            exportCsvLoading: "Export CSV...",
        },
        status: {
            loading: "Chargement...",
            loadingLogs: "Chargement des journaux OpenAI...",
            noLogs: "Aucun journal OpenAI trouvé.",
            noResult: "Aucun résultat.",
            exportTruncated:
                "L'export CSV a été tronqué à 10000 lignes maximum.",
            exportCsvFailed: "Impossible d'exporter le CSV.",
            invalidDateRange:
                "Date début ne peut pas être plus grande que Date fin.",
            loadFailed: "Impossible de charger les journaux OpenAI.",
            networkLoadFailed:
                "Erreur réseau lors du chargement des journaux OpenAI.",
            unknownTimestamp: "Inconnu",
            invalidTimestamp: "Invalide",
            logSingular: "log",
            logPlural: "logs",
            yes: "Oui",
            no: "Non",
            neutralizedPrefix: "Neutralisé:",
            unknownActor: "unknown",
            bytesSuffix: "B",
        },
        table: {
            date: "Date",
            action: "Action",
            result: "Résultat",
            actor: "Acteur",
            user: "Usager",
            role: "Rôle",
            ip: "IP",
            model: "Modèle",
            payload: "Charge utile",
            classification: "Classification",
            context: "Contexte",
            route: "Route",
            path: "Path",
            transport: "Transport",
            upstream: "Upstream",
            neutralized: "Neutralisé",
            error: "Erreur",
        },
        pagination: {
            first: "<<",
            previousSymbol: "<",
            nextSymbol: ">",
            last: ">>",
            previous: "Précédent",
            next: "Suivant",
            pagePrefix: "Page",
            pageSeparator: "/",
            resultSuffix: "résultats",
            dashSeparator: "-",
        },
    },
} as const;

export type UiLabelsFr = typeof UI_LABELS_FR;
