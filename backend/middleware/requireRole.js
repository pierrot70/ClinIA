export function requireRole(...roles) {
    const allowedRoles = new Set(roles);

    return function roleGuard(req, res, next) {
        const role = req.auth?.role;

        if (!role) {
            return res.status(401).json({
                error: {
                    code: "UNAUTHORIZED",
                    message: "Authentification requise.",
                    retryable: false,
                },
            });
        }

        if (!allowedRoles.has(role)) {
            return res.status(403).json({
                error: {
                    code: "FORBIDDEN",
                    message: "Permissions insuffisantes.",
                    retryable: false,
                },
            });
        }

        return next();
    };
}
