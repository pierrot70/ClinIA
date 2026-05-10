export const UI_LABELS_FR = {
    auth: {
        session: {
            warningTitle: "Fin de session imminente",
            warningBody:
                "Votre session ClinIA va expirer dans moins d'une minute pour cause d'inactivite.",
            warningContinue: "Continuer la session",
            warningLogout: "Se deconnecter maintenant",
            validating: "Validation de session...",
            revokedTitle: "Session interrompue par securite",
            revokedBody:
                "Une activite inhabituelle a ete detectee sur ce compte. Votre session a ete invalidee par securite et une reconnexion est necessaire pour poursuivre. Si cette activite ne venait pas de vous, changez votre mot de passe des maintenant.",
            restrictedTitle: "Acces temporairement restreint",
            restrictedBody:
                "Une activite inhabituelle a ete detectee sur ce compte. Votre session a ete invalidee par securite et une reconnexion est necessaire. ClinIA bloque temporairement l'acces aux routes sensibles pendant la periode de restriction. Si cette activite ne venait pas de vous, changez votre mot de passe des maintenant.",
            restrictedUntilPrefix: "Fin de restriction :",
        },
        sensitiveAction: {
            title: "Confirmation requise",
            description:
                "Confirmez votre identité avec votre mot de passe pour poursuivre cette action sensible.",
            connectedAccountPrefix: "Compte connecté :",
            passwordLabel: "Mot de passe du compte actuellement connecté",
            helper:
                "Utilisez le mot de passe de votre session SUPERADMIN actuelle, pas celui du nouvel utilisateur en cours de création ou de modification.",
            prompt:
                "Veuillez reconfirmer votre mot de passe pour cette action sensible.",
            confirm: "Confirmer",
            confirming: "Confirmation...",
            cancel: "Annuler",
            invalidPassword:
                "Mot de passe de confirmation invalide ou session sensible expiree.",
            networkError:
                "Impossible de reconfirmer votre mot de passe pour le moment.",
        },
        passwordResetRequired: {
            title: "Reinitialisation du mot de passe requise",
            detected:
                "Une activite inhabituelle a ete detectee sur ce compte.",
            required:
                "L'acces aux zones protegees reste bloque tant qu'un vrai reset de mot de passe n'a pas ete effectue.",
            contact:
                "Contactez un SUPERADMIN pour faire reinitialiser votre mot de passe, ou utilisez le parcours de reinitialisation prevu lorsqu'il sera disponible.",
            accountPrefix: "Compte concerne :",
            logout: "Se deconnecter",
        },
    },
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
            demoTooltip:
                "Ce bouton vous permet de vous familiariser avec l'application sans connexion.",
            tooltipOk: "OK",
        },
        // App.tsx - bannière globale lorsque le mode maintenance est actif.
        status: {
            maintenance:
                "Maintenance en cours. L'application est temporairement arrêtée pour les usagers non SUPERADMIN.",
        },
    },
    // Header.tsx - navigation globale, menus et modales d'administration.
    header: {
        brand: {
            subtitle: "Assistant clinique IA - Prototype",
        },
        controls: {
            language: "Langue",
            openMenu: "Ouvrir le menu",
            menu: "Menu",
            close: "Fermer",
            refresh: "Rafraichir",
            search: "Rechercher",
            reset: "Reinitialiser",
        },
        publicHome: {
            languageTooltip:
                "Vous pouvez sélectionner la langue de votre choix.",
            tooltipOk: "OK",
        },
        aiMode: {
            real: "IA réelle",
            mock: "IA mock",
            forceRealTitle: "Forcer IA réelle",
            mockTitle: "Utiliser le mode mock",
        },
        nav: {
            home: "Accueil",
            clinicalAnalysis: "Analyse clinique",
            comments: "Commentaires",
            clinicManagement: "Gestion clinique",
            appointments: "Rendez-vous",
            patients: "Patients",
            cliniques: "Cliniques",
            specialists: "Spécialistes",
            openaiLogs: "OpenAI logs",
            appManagement: "Gestion Application",
            quickMode: "Mode rapide",
            patientSummary: "Résumé patient",
            login: "Connexion",
            admin: "Admin",
            mockStudio: "Mock Studio",
            patientAudits: "Audits patient",
            openaiAudits: "Audits OpenAI",
            users: "Utilisateurs",
            logout: "Déconnexion",
        },
        appManagement: {
            activeUsers: "Montrer Usager Actif",
            authLogs: "Montrer Auth Log",
            authGraphs: "Graphiques Auth",
            newComments: "Nouveaux commentaires médecins",
            securityIncidents: "Incidents sécurité",
            xyGraph: "x-y graph",
            pieGraph: "Pie graph",
            histogramGraph: "Histogramme graph",
            shutdown: "Arret de l'application",
            clearMaintenance: "Fin de maintenance",
            forceReopen: "Forcer reouverture normale",
        },
        clinicianCommentsInbox: {
            title: "Nouveaux commentaires médecins",
            description:
                "Commentaires déposés depuis votre dernière consultation de cette boîte de réception.",
            loading: "Chargement des nouveaux commentaires...",
            empty: "Aucun nouveau commentaire médecin.",
            actor: "Auteur",
            category: "Catégorie",
            replied: "Répondu",
            repliedYes: "Oui",
            repliedNo: "Non",
            createdAt: "Date",
            comment: "Commentaire",
            filtersActor: "Auteur",
            filtersCategory: "Catégorie",
            filtersReplied: "Répondu",
            filtersStartDate: "Date début",
            filtersEndDate: "Date fin",
            all: "Tous",
            allFeminine: "Toutes",
            close: "Fermer",
            refresh: "Actualiser",
            reply: "Répondre",
            replyPlaceholder: "Écrire une réponse au commentaire sélectionné...",
            replySubmit: "Envoyer la réponse",
            replying: "Envoi...",
            replySaved: "Réponse enregistrée.",
            replyCancel: "Annuler",
            pagePrefix: "Page",
            pageSeparator: "/",
            resultSuffix: "résultats",
            first: "<<",
            previousSymbol: "<",
            nextSymbol: ">",
            last: ">>",
            action: "Action",
        },
        securityIncidentsIndicator: {
            label: "Incidents sécurité",
            none: "Aucun incident sécurité non acquitté",
            one: "1 incident sécurité non acquitté",
            manySuffix: "incidents sécurité non acquittés",
            refresh: "Actualiser les incidents de sécurité",
            error: "Incidents sécurité indisponibles",
        },
        securityIncidentsModal: {
            title: "Incidents sécurité",
            description:
                "Surveillez les comportements détectés et acquittez ceux qui ont été analysés.",
            loading: "Chargement des incidents de sécurité...",
            empty: "Aucun incident de sécurité pour ce filtre.",
            all: "Tous",
            acknowledgedOnly: "Acquittés",
            notAcknowledgedOnly: "Non acquittés",
            filtersAcknowledged: "Statut",
            filtersType: "Type",
            detectedAt: "Date",
            type: "Type",
            reason: "Raison",
            requestPath: "Chemin",
            context: "Contexte",
            impactedAccount: "Compte impacté",
            action: "Action",
            acknowledge: "Acquitter",
            acknowledging: "Acquittement...",
            acknowledged: "Déjà acquitté",
            acknowledgedAtPrefix: "Acquitté le:",
            pagePrefix: "Page",
            pageSeparator: "/",
            resultSuffix: "résultats",
            first: "<<",
            previousSymbol: "<",
            nextSymbol: ">",
            last: ">>",
            refresh: "Actualiser",
            close: "Fermer",
        },
        activeUsersModal: {
            title: "Usagers actifs",
            loading: "Chargement des usagers actifs...",
            empty: "Aucun usager actif.",
            noEmail: "Aucun courriel",
            lastLogin: "Derniere connexion:",
            unknown: "Inconnue",
        },
        authLogsModal: {
            title: "Auth Log",
            queryTimePrefix: "Temps requete:",
            startDate: "Date debut",
            endDate: "Date fin",
            action: "Action",
            loading: "Chargement des logs auth...",
            empty: "Aucun resultat.",
            tableDate: "Date",
            tableAction: "Action",
            tableResult: "Resultat",
            tableUser: "Usager",
            tableRole: "Role",
            tableIp: "IP",
            tableReason: "Raison",
            page: "Page",
            results: "resultats",
        },
        authGraphsModal: {
            titlePrefix: "Auth Graphs",
            axisLabel: "Axe X: Date | Axe Y: Nombre de log",
            loading: "Chargement du graphique auth...",
            emptyRange: "Aucune donnee pour cette plage.",
            emptyAction: "Aucune donnee action pour ce graphique.",
            logCount: "Nombre de log",
        },
        authGraphTooltip: {
            date: "Date:",
            logs: "Logs:",
            openLogs: "Ouvrir logs",
            totalLogs: "Total logs:",
            all: "Tous",
        },
    },
    // LoginPage.tsx / AdminLogin.tsx - écrans de connexion et création de compte.
    loginPage: {
        title: {
            admin: "Connexion administrateur",
            register: "Creation de compte ClinIA",
            login: "Connexion ClinIA",
        },
        description: {
            admin: "Acces reserve a la console d'administration ClinIA.",
            register:
                "Creer un compte avec votre courriel, mot de passe et role.",
            login:
                "Connectez-vous pour acceder aux modules cliniques securises.",
        },
        modeToggle: {
            alreadyHaveAccount: "J'ai deja un compte",
            createAccount: "Je n'ai pas de compte, en creer un",
        },
        fields: {
            email: "Courriel",
            identifier: "Identifiant (courriel ou nom d'utilisateur)",
            password: "Mot de passe",
            accountRole: "Role du compte",
        },
        action: {
            creating: "Creation...",
            loggingIn: "Connexion...",
            createAccount: "Creer mon compte",
            login: "Se connecter",
        },
        errors: {
            adminOnly: "Acces reserve aux comptes administrateurs.",
            createFailed: "Impossible de creer le compte.",
            loginFailed:
                "Impossible de se connecter. Verifiez vos identifiants.",
        },
    },
    // ClinicalAnalyzePage.tsx - expérience /clinical-demo.
    clinicalDemo: {
        // ClinicalAnalyzePage.tsx - bloc commentaires et consultation des réponses.
        comments: {
            leaveComment: "Laisser un commentaire",
            leaveCommentTooltip:
                "Cliquez ici pour ouvrir la page des commentaires, laisser un message de support ou de suivi, puis consulter les réponses plus tard avec votre code de suivi.",
            openaiModelTooltip:
                "Utilisez ce selecteur pour choisir le modele d'analyse. Le mode mini est habituellement plus rapide et convient bien aux essais courants. L'autre modele peut servir de point de comparaison si vous voulez verifier comment la formulation ou la structure de la reponse change.",
            exampleCaseTooltip:
                "Utilisez ce selecteur pour charger un cas clinique deja rempli. C'est utile pour decouvrir rapidement le fonctionnement de ClinIA sans saisir toutes les donnees a la main.",
            replyLookupTitle: "Voir les réponses à mes commentaires",
            replyLookupDescription:
                "Entrez exactement le nom ou pseudonyme utilisé lors du commentaire, ainsi que votre code de suivi. Si votre navigateur a conservé ces informations, elles sont pré-remplies automatiquement.",
            namePlaceholder: "Nom ou pseudonyme",
            trackingCodePlaceholder: "Code de suivi",
            searchLoading: "Recherche...",
            viewReplies: "Voir mes réponses",
            viewRepliesTooltip:
                "Cliquez ici pour vérifier si l'équipe ClinIA a répondu à vos commentaires à l'aide de votre nom ou pseudonyme et de votre code de suivi.",
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
            restrictedAccess:
                "Acces temporairement restreint: ClinIA a bloque cette zone sensible apres une activite inhabituelle detectee sur ce compte. Reessayez plus tard ou contactez un SUPERADMIN.",
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
