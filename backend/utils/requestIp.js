// Express resolves req.ip only after applying the app's explicit trust proxy policy.
// Never read forwarding headers here: a direct client can forge them.
export function getTrustedRequestIp(req) {
    const expressIp = typeof req?.ip === "string" ? req.ip.trim() : "";
    if (expressIp) {
        return expressIp;
    }

    const socketIp = typeof req?.socket?.remoteAddress === "string"
        ? req.socket.remoteAddress.trim()
        : "";
    if (socketIp) {
        return socketIp;
    }

    const connectionIp = typeof req?.connection?.remoteAddress === "string"
        ? req.connection.remoteAddress.trim()
        : "";

    return connectionIp || "unknown";
}
