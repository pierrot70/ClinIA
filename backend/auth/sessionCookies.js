export const REFRESH_TOKEN_COOKIE_NAME = "clinia_refresh_token";
export const SENSITIVE_REAUTH_COOKIE_NAME = "clinia_sensitive_reauth";

export function parseCookies(cookieHeader) {
    if (typeof cookieHeader !== "string" || !cookieHeader.trim()) {
        return {};
    }

    return cookieHeader.split(";").reduce((cookies, part) => {
        const separatorIndex = part.indexOf("=");
        if (separatorIndex <= 0) {
            return cookies;
        }

        const key = part.slice(0, separatorIndex).trim();
        const rawValue = part.slice(separatorIndex + 1).trim();

        if (!key) {
            return cookies;
        }

        try {
            cookies[key] = decodeURIComponent(rawValue);
        } catch {
            cookies[key] = rawValue;
        }

        return cookies;
    }, {});
}

export function getIsSecureRequest(req) {
    const forwardedProto = req.headers["x-forwarded-proto"];
    return (
        req.secure ||
        (typeof forwardedProto === "string" &&
            forwardedProto.toLowerCase().includes("https"))
    );
}

export function getRefreshCookieOptions(req) {
    const isSecure = getIsSecureRequest(req);

    return {
        httpOnly: true,
        sameSite: isSecure ? "none" : "lax",
        secure: isSecure,
        path: "/api/auth",
    };
}

export function getSensitiveReauthCookieOptions(req) {
    const isSecure = getIsSecureRequest(req);

    return {
        httpOnly: true,
        sameSite: isSecure ? "none" : "lax",
        secure: isSecure,
        path: "/api/auth",
        maxAge: 5 * 60 * 1000,
    };
}

export function getRefreshTokenFromRequest(req) {
    const bodyToken = req.body?.refreshToken;
    if (typeof bodyToken === "string" && bodyToken.trim()) {
        return bodyToken;
    }

    const cookies = parseCookies(req.headers.cookie);
    const cookieToken = cookies[REFRESH_TOKEN_COOKIE_NAME];
    if (typeof cookieToken === "string" && cookieToken.trim()) {
        return cookieToken;
    }

    return undefined;
}
