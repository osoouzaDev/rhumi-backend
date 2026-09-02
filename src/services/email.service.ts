import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import type { EmailJob } from "../repositories/email.repository.js";

const transporter: Transporter | undefined = env.EMAIL_DELIVERY_ENABLED
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER && env.SMTP_PASSWORD
            ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
            : undefined,
        tls: { rejectUnauthorized: env.SMTP_REJECT_UNAUTHORIZED },
        pool: true,
        maxConnections: 5,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
    })
    : undefined;

const html = (value: unknown): string => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const safeLink = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    try {
        const url = new URL(value, env.PUBLIC_APP_URL);
        return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined;
    } catch {
        return undefined;
    }
};

const actionButton = (url: string | undefined, label: string): string => url
    ? `<p><a href="${html(url)}" style="display:inline-block;padding:12px 18px;`
        + `background:#315efb;color:#fff;text-decoration:none;border-radius:6px">`
        + `${html(label)}</a></p>`
    : "";

const baseTemplate = (title: string, content: string): string => `<!doctype html>
<html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5">
<main style="max-width:640px;margin:24px auto;padding:24px;border:1px solid #e6e9ef;border-radius:8px">
<h1 style="font-size:22px">${html(title)}</h1>${content}
<p style="margin-top:28px;color:#667085;font-size:13px">Mensagem automática da RHumi.</p>
</main></body></html>`;

const renderAccountEmail = (job: EmailJob): string => {
    const fullName = html(job.payload.fullName ?? "");
    const actionUrl = safeLink(job.payload.actionUrl);
    const labels: Record<string, string> = {
        activation: "Ativar conta",
        password_reset: "Redefinir senha",
        email_verification: "Confirmar e-mail",
    };
    return baseTemplate(
        job.subject,
        `<p>Olá, ${fullName}.</p><p>Use o botão abaixo para continuar.</p>`
        + actionButton(actionUrl, labels[job.template] ?? "Continuar")
        + `<p>Se você não solicitou esta ação, ignore esta mensagem.</p>`,
    );
};

const renderNotificationEmail = (job: EmailJob): string => {
    const title = String(job.payload.title ?? job.subject);
    const description = html(job.payload.description ?? "");
    return baseTemplate(
        title,
        `<p>${description}</p>${actionButton(safeLink(job.payload.actionUrl), "Abrir na RHumi")}`,
    );
};

const renderDigestEmail = (job: EmailJob): string => {
    const items = Array.isArray(job.payload.items) ? job.payload.items : [];
    const list = items.slice(0, 100).map((item) => {
        const entry = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return `<li style="margin-bottom:12px"><strong>${html(entry.title)}</strong><br>`
            + `${html(entry.description)}</li>`;
    }).join("");
    return baseTemplate(
        job.subject,
        `<p>Estas são as pendências mais recentes da sua central.</p><ul>${list}</ul>`
        + actionButton(safeLink(job.payload.actionUrl), "Abrir central de notificações"),
    );
};

export const renderEmailHtml = (job: EmailJob): string => {
    if (["activation", "password_reset", "email_verification"].includes(job.template)) {
        return renderAccountEmail(job);
    }
    if (job.template === "notification_digest") {
        return renderDigestEmail(job);
    }
    return renderNotificationEmail(job);
};

export class EmailService {
    async send(job: EmailJob): Promise<void> {
        if (!transporter || !env.EMAIL_FROM_ADDRESS) {
            throw new Error("E-mail delivery is not configured.");
        }
        await transporter.sendMail({
            from: { name: env.EMAIL_FROM_NAME, address: env.EMAIL_FROM_ADDRESS },
            to: job.recipient,
            subject: job.subject,
            html: renderEmailHtml(job),
        });
    }

    async verify(): Promise<"up" | "disabled"> {
        if (!transporter) return "disabled";
        await transporter.verify();
        return "up";
    }

    close(): void {
        transporter?.close();
    }
}

export const emailService = new EmailService();
