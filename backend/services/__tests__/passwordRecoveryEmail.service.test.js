import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMailMock = vi.fn();
const createTransportMock = vi.fn(() => ({
    sendMail: sendMailMock,
}));

vi.mock("nodemailer", () => ({
    default: {
        createTransport: createTransportMock,
    },
}));

describe("password recovery email service", () => {
    beforeEach(() => {
        vi.stubEnv("SMTP_HOST", "mailpit");
        vi.stubEnv("SMTP_PORT", "1025");
        vi.stubEnv("SMTP_SECURE", "false");
        vi.stubEnv("SMTP_FROM", "ClinIA <securite@clinique-ai.ca>");
        vi.stubEnv("SMTP_USERNAME", "");
        vi.stubEnv("SMTP_PASSWORD", "");
        createTransportMock.mockClear();
        sendMailMock.mockReset().mockResolvedValue(undefined);
    });

    it("sends the six-digit code through the configured SMTP server", async () => {
        const { sendPasswordRecoveryCode } =
            await import("../passwordRecoveryEmail.js");

        await sendPasswordRecoveryCode({
            email: "doctor@clinia.local",
            code: "123456",
        });

        expect(createTransportMock).toHaveBeenCalledWith({
            host: "mailpit",
            port: 1025,
            secure: false,
            auth: undefined,
        });
        expect(sendMailMock).toHaveBeenCalledWith(
            expect.objectContaining({
                from: "ClinIA <securite@clinique-ai.ca>",
                to: "doctor@clinia.local",
                subject: "Votre code de verification ClinIA",
                text: expect.stringContaining("123456"),
            })
        );
    });

    it("reports recovery as unavailable when SMTP delivery is not configured", async () => {
        vi.stubEnv("SMTP_HOST", "");
        const { isPasswordRecoveryDeliveryConfigured } =
            await import("../passwordRecoveryEmail.js");

        expect(isPasswordRecoveryDeliveryConfigured()).toBe(false);
    });

    it("sends a password changed confirmation without including a password", async () => {
        const { sendPasswordChangedConfirmation } =
            await import("../passwordRecoveryEmail.js");

        await sendPasswordChangedConfirmation({
            email: "doctor@clinia.local",
        });

        const payload = sendMailMock.mock.calls[0][0];
        expect(payload).toEqual(
            expect.objectContaining({
                to: "doctor@clinia.local",
                subject: "Votre mot de passe ClinIA a ete modifie",
                text: expect.stringContaining(
                    "Toutes les sessions existantes ont ete fermees."
                ),
            })
        );
        expect(payload.text).not.toContain("NewPassword123!");
    });
});
