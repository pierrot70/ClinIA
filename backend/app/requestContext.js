import crypto from "crypto";

function makeDefaultInstanceId() {
    return `instance-${crypto.randomUUID().slice(0, 8)}`;
}

export function createRequestContextMiddleware({
    instanceId = process.env.CLINIA_INSTANCE_ID || makeDefaultInstanceId(),
    makeRequestId = () => crypto.randomUUID(),
} = {}) {
    return function requestContextMiddleware(req, res, next) {
        const requestId = makeRequestId();

        req.requestContext = {
            instanceId,
            requestId,
        };

        res.setHeader("X-Request-ID", requestId);
        res.setHeader("X-ClinIA-Instance", instanceId);
        return next();
    };
}

export function getRequestContext(req) {
    return {
        instanceId: req?.requestContext?.instanceId || "unknown",
        requestId: req?.requestContext?.requestId || "unknown",
    };
}
