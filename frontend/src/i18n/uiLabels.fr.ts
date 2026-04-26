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
} as const;

export type UiLabelsFr = typeof UI_LABELS_FR;
