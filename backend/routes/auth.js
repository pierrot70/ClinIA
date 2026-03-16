import express from "express";

import {
    loginRateLimiter,
    refreshRateLimiter,
} from "../middleware/loginRateLimiter.js";
import { requireRole } from "../middleware/requireRole.js";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { AUTH_ROLES } from "../auth/constants.js";
import {
    login,
    logout,
    register,
    registerSelf,
    refresh,
} from "../services/auth.js";

const router = express.Router();

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
            err.code === "REFRESH_TOKEN_EXPIRED"
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

export default router;
