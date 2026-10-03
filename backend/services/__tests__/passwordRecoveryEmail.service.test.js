import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reserveEmailAttempt } from "../emailDailyQuota.js";

vi.mock("../emailDailyQuota.js", () => ({ reserveEmailAttempt: vi.fn() }));

const sendMailMock = vi.fn();
const createTransportMock = vi.fn(() => ({
    sendMail: sendMailMock,
    close: vi.fn(),
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
        vi.mocked(reserveEmailAttempt).mockReset().mockResolvedValue(undefined);
    });
    afterEach(() => vi.unstubAllEnvs());

    it("rejects recipient lists without consuming quota or contacting SMTP", async () => {
        const { sendPasswordRecoveryCode } = await import("../passwordRecoveryEmail.js");
        await expect(sendPasswordRecoveryCode({ email: "one@example.invalid,two@example.invalid", code: "123456" }))
            .rejects.toMatchObject({ code: "EMAIL_RECIPIENT_INVALID" });
        expect(reserveEmailAttempt).not.toHaveBeenCalled();
        expect(createTransportMock).not.toHaveBeenCalled();
    });

    it.each(["EMAIL_DAILY_LIMIT_REACHED", "EMAIL_QUOTA_UNAVAILABLE"])("blocks both email types before SMTP when %s", async (code) => {
        vi.mocked(reserveEmailAttempt).mockRejectedValue(Object.assign(new Error("blocked"), { code }));
        const { sendPasswordRecoveryCode, sendPasswordChangedConfirmation } = await import("../passwordRecoveryEmail.js");
        await expect(sendPasswordRecoveryCode({ email: "synthetic@example.invalid", code: "123456" })).rejects.toMatchObject({ code });
        await expect(sendPasswordChangedConfirmation({ email: "synthetic@example.invalid" })).rejects.toMatchObject({ code });
        expect(createTransportMock).not.toHaveBeenCalled();
        expect(sendMailMock).not.toHaveBeenCalled();
    });

    it("reserves before SMTP and propagates a delivery failure", async () => {
        sendMailMock.mockImplementation(async () => {
            expect(reserveEmailAttempt).toHaveBeenCalledTimes(1);
            throw new Error("synthetic SMTP failure");
        });
        const { sendPasswordRecoveryCode } = await import("../passwordRecoveryEmail.js");
        await expect(sendPasswordRecoveryCode({ email: "synthetic@example.invalid", code: "123456" })).rejects.toThrow("synthetic SMTP failure");
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
