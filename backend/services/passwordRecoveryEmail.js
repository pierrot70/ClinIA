import nodemailer from "nodemailer";

export function isPasswordRecoveryDeliveryConfigured() {
    const host = String(process.env.SMTP_HOST || "").trim();
    const port = Number.parseInt(process.env.SMTP_PORT || "587", 10);

    return (
        process.env.PASSWORD_RECOVERY_ENABLED !== "false" &&
        Boolean(host) &&
        Number.isFinite(port) &&
        port > 0 &&
        port <= 65535
    );
}

function getSmtpConfig() {
    const host = String(process.env.SMTP_HOST || "").trim();
    const port = Number.parseInt(process.env.SMTP_PORT || "587", 10);

    if (!isPasswordRecoveryDeliveryConfigured()) {
        throw new Error("SMTP_HOST and SMTP_PORT are required");
    }

    const username = String(process.env.SMTP_USERNAME || "").trim();
    const password = String(process.env.SMTP_PASSWORD || "");

    return {
        host,
        port,
        secure: process.env.SMTP_SECURE === "true",
        auth:
            username && password
                ? {
                    user: username,
                    pass: password,
                }
                : undefined,
    };
}

export async function sendPasswordRecoveryCode({ email, code }) {
    const transporter = nodemailer.createTransport(getSmtpConfig());
    const from =
        String(process.env.SMTP_FROM || "").trim() ||
        "ClinIA <securite@clinique-ai.ca>";

    await transporter.sendMail({
        from,
        to: email,
        subject: "Votre code de verification ClinIA",
        text: [
            "Une demande de reinitialisation de mot de passe a ete recue.",
            "",
            `Votre code ClinIA est : ${code}`,
            "",
            "Ce code expire dans 10 minutes et ne peut etre utilise qu'une seule fois.",
            "Si vous n'avez pas fait cette demande, ignorez ce message.",
        ].join("\n"),
    });
}

export async function sendPasswordChangedConfirmation({ email }) {
    const transporter = nodemailer.createTransport(getSmtpConfig());
    const from =
        String(process.env.SMTP_FROM || "").trim() ||
        "ClinIA <securite@clinique-ai.ca>";

    await transporter.sendMail({
        from,
        to: email,
        subject: "Votre mot de passe ClinIA a ete modifie",
        text: [
            "Le mot de passe de votre compte ClinIA vient d'etre modifie.",
            "",
            "Toutes les sessions existantes ont ete fermees.",
            "Si vous n'avez pas effectue cette operation, contactez immediatement l'administrateur ClinIA.",
        ].join("\n"),
    });
}
