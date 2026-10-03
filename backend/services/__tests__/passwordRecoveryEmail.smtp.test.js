import net from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendPasswordRecoveryCode, sendPasswordChangedConfirmation } from "../passwordRecoveryEmail.js";

// Quota concurrency is exercised separately against disposable MongoDB.
vi.mock("../emailDailyQuota.js", () => ({ reserveEmailAttempt: vi.fn().mockResolvedValue(undefined) }));

// Real Nodemailer against a loopback-only SMTP sink; no external delivery.
describe("password recovery SMTP compatibility", () => {
    let server;
    let sockets;
    let messages;
    let rejectRecipient;

    beforeEach(async () => {
        sockets = new Set();
        messages = [];
        rejectRecipient = false;
        server = net.createServer((socket) => {
            sockets.add(socket);
            socket.on("close", () => sockets.delete(socket));
            socket.setEncoding("utf8");
            socket.write("220 localhost test SMTP\r\n");
            let buffer = "";
            let data = null;
            socket.on("data", (chunk) => {
                buffer += chunk;
                let end;
                while ((end = buffer.indexOf("\r\n")) !== -1) {
                    const line = buffer.slice(0, end);
                    buffer = buffer.slice(end + 2);
                    if (data !== null) {
                        if (line === ".") {
                            messages.push(data.join("\r\n"));
                            data = null;
                            socket.write("250 queued\r\n");
                        } else data.push(line);
                    } else if (/^EHLO|^HELO/.test(line)) {
                        socket.write("250 localhost\r\n");
                    } else if (line.startsWith("RCPT") && rejectRecipient) {
                        socket.write("550 rejected\r\n");
                    } else if (line === "DATA") {
                        data = [];
                        socket.write("354 send message\r\n");
                    } else if (line === "QUIT") {
                        socket.end("221 bye\r\n");
                    } else socket.write("250 OK\r\n");
                }
            });
        });
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", resolve);
        });
        vi.stubEnv("SMTP_HOST", "127.0.0.1");
        vi.stubEnv("SMTP_PORT", String(server.address().port));
        vi.stubEnv("SMTP_SECURE", "false");
        vi.stubEnv("SMTP_USERNAME", "");
        vi.stubEnv("SMTP_PASSWORD", "");
        vi.stubEnv("SMTP_FROM", "ClinIA <sender@example.invalid>");
        vi.stubEnv("PASSWORD_RECOVERY_ENABLED", "true");
    });

    afterEach(async () => {
        for (const socket of sockets) socket.destroy();
        if (server.listening) await new Promise((resolve) => server.close(resolve));
        vi.unstubAllEnvs();
    });

    it("delivers recovery and confirmation MIME messages with the installed Nodemailer", async () => {
        await sendPasswordRecoveryCode({ email: "synthetic@example.invalid", code: "123456" });
        await sendPasswordChangedConfirmation({ email: "synthetic@example.invalid" });
        expect(messages).toHaveLength(2);
        expect(messages[0]).toContain("To: synthetic@example.invalid");
        expect(messages[0]).toContain("Votre code ClinIA est : 123456");
        expect(messages[1]).toContain("Subject: Votre mot de passe ClinIA a ete modifie");
        expect(messages[1]).not.toContain("123456");
    });

    it("propagates SMTP recipient rejection rather than reporting delivery", async () => {
        rejectRecipient = true;
        await expect(sendPasswordRecoveryCode({ email: "synthetic@example.invalid", code: "123456" }))
            .rejects.toMatchObject({ code: "EENVELOPE", responseCode: 550 });
        expect(messages).toHaveLength(0);
    });
});
