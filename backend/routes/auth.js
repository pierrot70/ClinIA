import express from "express";

import {
    loginRateLimiter,
    refreshRateLimiter,
} from "../middleware/loginRateLimiter.js";
import { requireRole } from "../middleware/requireRole.js";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { AUTH_ROLES } from "../auth/constants.js";
import {
    deleteUser,
    login,
    listActiveUsers,
    listAuthLogGraphs,
    listAuthLogs,
    listUsers,
    logout,
    register,
    registerSelf,
    resetUserPassword,
    refresh,
    setUserActiveStatus,
    updateUser,
} from "../services/auth.js";
import {
    enforceScheduledShutdownIfDue,
    forceClearMaintenanceState,
    getAppShutdownState,
    isMaintenanceActive,
    scheduleAppShutdown,
    clearMaintenanceState,
} from "../services/appShutdown.js";

const router = express.Router();

router.get("/app-status", async (_req, res) => {
    await enforceScheduledShutdownIfDue();

    const shutdownState = getAppShutdownState();
    return res.status(200).json({
        data: {
            maintenanceActive: isMaintenanceActive(),
            shutdownAt: shutdownState.shutdownAt,
            activatedAt: shutdownState.activatedAt,
            enforcedAt: shutdownState.enforcedAt,
        },
        meta: {
            source: "real",
            model: "auth",
        },
    });
});

router.post("/login", loginRateLimiter, async (req, res) => {
    const { username, email, password } = req.body ?? {};

    try {
        const data = await login({
            username,
            email,
            password,
            req,
        });

        return res.status(200).json({
            data,
            meta: {
                source: "real",
                model: "auth",
            },
        });
    } catch (err) {
        if (err.code === "INVALID_INPUT") {
            return res.status(400).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        if (err.code === "ACCOUNT_LOCKED") {
            return res.status(423).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: true,
                },
            });
        }

        if (err.code === "INVALID_CREDENTIALS") {
            return res.status(401).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        if (err.code === "ACCOUNT_INACTIVE") {
            return res.status(403).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        if (err.code === "APP_SHUTDOWN") {
            return res.status(403).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        console.error("❌ Auth login error:", err?.code || err?.message);
        return res.status(500).json({
            error: {
                code: "AUTH_LOGIN_FAILED",
                message: "Impossible de se connecter pour le moment.",
                retryable: true,
            },
        });
    }
});

router.post("/register-self", loginRateLimiter, async (req, res) => {
    const { email, password, role } = req.body ?? {};

    try {
        const data = await registerSelf({
            email,
            password,
            role,
            req,
        });

        return res.status(201).json({
            data,
            meta: {
                source: "real",
                model: "auth",
            },
        });
    } catch (err) {
        if (err.code === "INVALID_INPUT") {
            return res.status(400).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        if (err.code === "USER_EXISTS") {
            return res.status(409).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        console.error("❌ Auth self-register error:", err?.code || err?.message);
        return res.status(500).json({
            error: {
                code: "AUTH_REGISTER_SELF_FAILED",
                message: "Impossible de creer le compte pour le moment.",
                retryable: true,
            },
        });
    }
});

router.post("/refresh", refreshRateLimiter, async (req, res) => {
    const { refreshToken } = req.body ?? {};

    try {
        const data = await refresh({ refreshToken, req });
        return res.status(200).json({
            data,
            meta: {
                source: "real",
                model: "auth",
            },
        });
    } catch (err) {
        if (err.code === "INVALID_INPUT") {
            return res.status(400).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        if (
            err.code === "INVALID_REFRESH_TOKEN" ||
            err.code === "REFRESH_TOKEN_EXPIRED" ||
            err.code === "APP_SHUTDOWN"
        ) {
            return res.status(401).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        console.error("❌ Auth refresh error:", err?.code || err?.message);
        return res.status(500).json({
            error: {
                code: "AUTH_REFRESH_FAILED",
                message: "Impossible de rafraichir la session.",
                retryable: true,
            },
        });
    }
});

router.post("/logout", verifyJWT, async (req, res) => {
    const { refreshToken } = req.body ?? {};

    try {
        await logout({ refreshToken, authUser: req.auth, req });

        return res.status(200).json({
            data: { success: true },
            meta: {
                source: "real",
                model: "auth",
            },
        });
    } catch (err) {
        console.error("❌ Auth logout error:", err?.code || err?.message);
        return res.status(500).json({
            error: {
                code: "AUTH_LOGOUT_FAILED",
                message: "Impossible de fermer la session.",
                retryable: true,
            },
        });
    }
});

router.get("/session", verifyJWT, async (req, res) => {
    return res.status(200).json({
        data: {
            user: {
                id: req.auth?.userId,
                username: req.auth?.username,
                role: req.auth?.role,
            },
        },
        meta: {
            source: "real",
            model: "auth",
        },
    });
});

router.post(
    "/register",
    verifyJWT,
    requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        const { username, email, password, role } = req.body ?? {};

        try {
            const data = await register({
                username,
                email,
                password,
                role,
                authUser: req.auth,
                req,
            });

            return res.status(201).json({
                data,
                meta: {
                    source: "real",
                    model: "auth",
                },
            });
        } catch (err) {
            if (err.code === "INVALID_INPUT") {
                return res.status(400).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            if (err.code === "USER_EXISTS") {
                return res.status(409).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            if (err.code === "FORBIDDEN") {
                return res.status(403).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            console.error("❌ Auth register error:", err?.code || err?.message);
            return res.status(500).json({
                error: {
                    code: "AUTH_REGISTER_FAILED",
                    message: "Impossible de creer l'utilisateur pour le moment.",
                    retryable: true,
                },
            });
        }
    }
);

router.get(
    "/users/active",
    verifyJWT,
    requireRole(AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const data = await listActiveUsers({ authUser: req.auth });
            return res.status(200).json({
                data,
                meta: {
                    source: "real",
                    model: "auth",
                },
            });
        } catch (err) {
            console.error("❌ Auth active users list error:", err?.code || err?.message);
            return res.status(500).json({
                error: {
                    code: "AUTH_ACTIVE_USERS_LIST_FAILED",
                    message: "Impossible de lister les usagers actifs.",
                    retryable: true,
                },
            });
        }
    }
);

router.get(
    "/auth-logs/graphs",
    verifyJWT,
    requireRole(AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const data = await listAuthLogGraphs({
                authUser: req.auth,
                startDate: req.query?.startDate,
                endDate: req.query?.endDate,
                action: req.query?.action,
            });

            return res.status(200).json({
                data,
                meta: {
                    source: "real",
                    model: "auth",
                },
            });
        } catch (err) {
            if (err.code === "INVALID_INPUT") {
                return res.status(400).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            console.error("❌ Auth logs graph error:", err?.code || err?.message);
            return res.status(500).json({
                error: {
                    code: "AUTH_LOGS_GRAPH_FAILED",
                    message: "Impossible de charger le graphique des logs auth.",
                    retryable: true,
                },
            });
        }
    }
);

router.get(
    "/auth-logs",
    verifyJWT,
    requireRole(AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            if (req.query?.graph === "true") {
                const data = await listAuthLogGraphs({
                    authUser: req.auth,
                    startDate: req.query?.startDate,
                    endDate: req.query?.endDate,
                    action: req.query?.action,
                });

                return res.status(200).json({
                    data,
                    meta: {
                        source: "real",
                        model: "auth",
                    },
                });
            }

            const data = await listAuthLogs({
                authUser: req.auth,
                page: req.query?.page,
                limit: req.query?.limit,
                startDate: req.query?.startDate,
                endDate: req.query?.endDate,
                action: req.query?.action,
            });

            return res.status(200).json({
                data,
                meta: {
                    source: "real",
                    model: "auth",
                },
            });
        } catch (err) {
            if (err.code === "INVALID_INPUT") {
                return res.status(400).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            console.error("❌ Auth logs list error:", err?.code || err?.message);
            return res.status(500).json({
                error: {
                    code: "AUTH_LOGS_LIST_FAILED",
                    message: "Impossible de lister les logs d'authentification.",
                    retryable: true,
                },
            });
        }
    }
);

router.get(
    "/users",
    verifyJWT,
    requireRole(AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const data = await listUsers({
                authUser: req.auth,
                page: req.query.page,
                limit: req.query.limit,
                search: req.query.search,
                role: req.query.role,
            });
            return res.status(200).json({
                data,
                meta: {
                    source: "real",
                    model: "auth",
                },
            });
        } catch (err) {
            if (err.code === "INVALID_INPUT") {
                return res.status(400).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            console.error("❌ Auth users list error:", err?.code || err?.message);
            return res.status(500).json({
                error: {
                    code: "AUTH_USERS_LIST_FAILED",
                    message: "Impossible de lister les utilisateurs.",
                    retryable: true,
                },
            });
        }
    }
);

router.patch(
    "/users/:userId",
    verifyJWT,
    requireRole(AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const data = await updateUser({
                userId: req.params.userId,
                updates: req.body,
                authUser: req.auth,
                req,
            });

            return res.status(200).json({
                data,
                meta: {
                    source: "real",
                    model: "auth",
                },
            });
        } catch (err) {
            if (err.code === "INVALID_INPUT") {
                return res.status(400).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            if (err.code === "USER_NOT_FOUND") {
                return res.status(404).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            if (err.code === "USER_EXISTS") {
                return res.status(409).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            if (err.code === "FORBIDDEN") {
                return res.status(403).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            console.error("❌ Auth user update error:", err?.code || err?.message);
            return res.status(500).json({
                error: {
                    code: "AUTH_USER_UPDATE_FAILED",
                    message: "Impossible de mettre a jour l'utilisateur.",
                    retryable: true,
                },
            });
        }
    }
);

router.patch(
    "/users/:userId/status",
    verifyJWT,
    requireRole(AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const data = await setUserActiveStatus({
                userId: req.params.userId,
                isActive: req.body?.isActive,
                authUser: req.auth,
                req,
            });
            return res.status(200).json({
                data,
                meta: {
                    source: "real",
                    model: "auth",
                },
            });
        } catch (err) {
            if (err.code === "INVALID_INPUT") {
                return res.status(400).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            if (err.code === "USER_NOT_FOUND") {
                return res.status(404).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            if (err.code === "FORBIDDEN") {
                return res.status(403).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            console.error("❌ Auth user status error:", err?.code || err?.message);
            return res.status(500).json({
                error: {
                    code: "AUTH_USER_STATUS_FAILED",
                    message: "Impossible de changer le statut utilisateur.",
                    retryable: true,
                },
            });
        }
    }
);

router.post(
    "/users/:userId/reset-password",
    verifyJWT,
    requireRole(AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const data = await resetUserPassword({
                userId: req.params.userId,
                newPassword: req.body?.newPassword,
                authUser: req.auth,
                req,
            });
            return res.status(200).json({
                data,
                meta: {
                    source: "real",
                    model: "auth",
                },
            });
        } catch (err) {
            if (err.code === "INVALID_INPUT") {
                return res.status(400).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            if (err.code === "USER_NOT_FOUND") {
                return res.status(404).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            console.error("❌ Auth reset password error:", err?.code || err?.message);
            return res.status(500).json({
                error: {
                    code: "AUTH_USER_RESET_PASSWORD_FAILED",
                    message: "Impossible de reinitialiser le mot de passe.",
                    retryable: true,
                },
            });
        }
    }
);

router.delete(
    "/users/:userId",
    verifyJWT,
    requireRole(AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const data = await deleteUser({
                userId: req.params.userId,
                authUser: req.auth,
                req,
            });
            return res.status(200).json({
                data,
                meta: {
                    source: "real",
                    model: "auth",
                },
            });
        } catch (err) {
            if (err.code === "INVALID_INPUT") {
                return res.status(400).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            if (err.code === "USER_NOT_FOUND") {
                return res.status(404).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            if (err.code === "FORBIDDEN") {
                return res.status(403).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            console.error("❌ Auth delete user error:", err?.code || err?.message);
            return res.status(500).json({
                error: {
                    code: "AUTH_USER_DELETE_FAILED",
                    message: "Impossible de supprimer l'utilisateur.",
                    retryable: true,
                },
            });
        }
    }
);

router.post(
    "/app-shutdown",
    verifyJWT,
    requireRole(AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const delaySecondsRaw = req.body?.delaySeconds;
            const delaySeconds =
                typeof delaySecondsRaw === "number"
                    ? delaySecondsRaw
                    : Number(delaySecondsRaw ?? 30);

            const data = await scheduleAppShutdown({
                delaySeconds,
                activatedBy: req.auth?.userId ?? null,
            });

            return res.status(200).json({
                data,
                meta: {
                    source: "real",
                    model: "auth",
                },
            });
        } catch (err) {
            if (err.code === "INVALID_INPUT") {
                return res.status(400).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            console.error("❌ App shutdown scheduling error:", err?.code || err?.message);
            return res.status(500).json({
                error: {
                    code: "APP_SHUTDOWN_SCHEDULE_FAILED",
                    message: "Impossible de planifier l'arret de l'application.",
                    retryable: true,
                },
            });
        }
    }
);

router.post(
    "/app-shutdown/clear",
    verifyJWT,
    requireRole(AUTH_ROLES.SUPERADMIN),
    async (_req, res) => {
        try {
            await clearMaintenanceState();
            return res.status(200).json({
                data: { maintenanceActive: false },
                meta: { source: "real", model: "auth" },
            });
        } catch (err) {
            console.error("❌ App shutdown clear error:", err?.message);
            return res.status(500).json({
                error: {
                    code: "APP_SHUTDOWN_CLEAR_FAILED",
                    message: "Impossible de terminer la maintenance.",
                    retryable: true,
                },
            });
        }
    }
);

router.post(
    "/app-shutdown/force-reopen",
    verifyJWT,
    requireRole(AUTH_ROLES.SUPERADMIN),
    async (_req, res) => {
        const result = await forceClearMaintenanceState();

        return res.status(200).json({
            data: {
                maintenanceActive: false,
                forceReopened: true,
                persisted: Boolean(result?.persisted),
                warning: result?.warning || null,
                reason: result?.reason || null,
            },
            meta: { source: "real", model: "auth" },
        });
    }
);

export default router;
