import net from "node:net";

import { getTrustedProxyCidrs } from "../app/configureCoreMiddleware.js";

// Cloudflare publishes these proxy ranges at https://www.cloudflare.com/ips.
// They are only used after proving that the request reached us through the
// configured internal reverse proxy; a browser header is never trusted alone.
const CLOUDFLARE_PROXY_CIDRS = [
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
    "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
    "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22", "2400:cb00::/32",
    "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32",
    "2a06:98c0::/29", "2c0f:f248::/32",
];

function normalizeIp(address = "") {
    const value = String(address).trim();
    return value.startsWith("::ffff:") ? value.slice(7) : value;
}

function isIpInCidrs(address, cidrs) {
    const normalizedAddress = normalizeIp(address);
    const ipVersion = net.isIP(normalizedAddress);
    if (!ipVersion) {
        return false;
    }

    if (cidrs.includes("loopback")) {
        const isIpv4Loopback = normalizedAddress.startsWith("127.");
        const isIpv6Loopback = normalizedAddress === "::1";
        if (isIpv4Loopback || isIpv6Loopback) {
            return true;
        }
    }

    const blockList = new net.BlockList();
    for (const cidr of cidrs) {
        if (cidr === "loopback") {
            continue;
        }
        const [network, prefix] = cidr.split("/");
        blockList.addSubnet(network, Number(prefix), net.isIP(network) === 6 ? "ipv6" : "ipv4");
    }

    return blockList.check(normalizedAddress, ipVersion === 6 ? "ipv6" : "ipv4");
}

function getDirectPeerIp(req) {
    return normalizeIp(req?.socket?.remoteAddress || req?.connection?.remoteAddress || "");
}

function getForwardedIps(req) {
    return String(req?.headers?.["x-forwarded-for"] || "")
        .split(",")
        .map(normalizeIp)
        .filter((address) => net.isIP(address) !== 0);
}

function getVerifiedCloudflareClientIp(req, env) {
    const directPeerIp = getDirectPeerIp(req);
    if (!isIpInCidrs(directPeerIp, getTrustedProxyCidrs(env))) {
        return "";
    }

    const forwardedIps = getForwardedIps(req);
    const cloudflareRelayIp = forwardedIps.at(-1);
    const claimedClientIp = normalizeIp(req?.headers?.["cf-connecting-ip"] || "");

    if (
        !cloudflareRelayIp ||
        !isIpInCidrs(cloudflareRelayIp, CLOUDFLARE_PROXY_CIDRS) ||
        net.isIP(claimedClientIp) === 0
    ) {
        return "";
    }

    return claimedClientIp;
}

// Express resolves req.ip only after applying the app's explicit trust proxy policy.
export function getTrustedRequestIp(req, env = process.env) {
    const cloudflareClientIp = getVerifiedCloudflareClientIp(req, env);
    if (cloudflareClientIp) {
        return cloudflareClientIp;
    }

    const expressIp = typeof req?.ip === "string" ? req.ip.trim() : "";
    if (expressIp) {
        return expressIp;
    }

    return getDirectPeerIp(req) || "unknown";
}
