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
} as const;

export type UiLabelsFr = typeof UI_LABELS_FR;
