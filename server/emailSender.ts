/**
 * SaffHire Email Sender
 * Sends transactional emails via Gmail SMTP using Nodemailer.
 * Credentials are read from environment variables (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).
 */

import nodemailer from "nodemailer";

function createTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for SSL (465), false for TLS (587)
    auth: { user, pass },
  });
}

export interface MonitorStatusEmailOptions {
  /** "On" or "Off" */
  newStatus: "On" | "Off";
  applicantName: string;
  fileNumber: string;
  /** Who triggered the change */
  changedBy?: string;
  /** List of recipient email addresses */
  recipients: string[];
}

/**
 * Sends a monitor status change notification to all recipients.
 * Subject: "Enable Monitoring" or "Disable Monitoring"
 */
export async function sendMonitorStatusEmail(opts: MonitorStatusEmailOptions): Promise<void> {
  if (!opts.recipients.length) return;

  const isEnabled = opts.newStatus === "On";
  const subject = isEnabled ? "Enable Monitoring" : "Disable Monitoring";
  const actionWord = isEnabled ? "enabled" : "disabled";
  const from = process.env.SMTP_USER || "robertk@saffhire.com";

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #0F172A; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="color: #1FFF00; margin: 0; font-size: 20px;">SaffHire Monitoring Alert</h2>
      </div>
      <div style="background: #F9FAFB; padding: 24px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="margin: 0 0 16px; color: #1F2937; font-size: 15px;">
          Monitor status has been <strong>${actionWord}</strong> for the following applicant:
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <tr>
            <td style="padding: 10px 12px; background: #fff; border: 1px solid #E5E7EB; font-weight: 600; color: #6B7280; width: 140px;">Applicant Name</td>
            <td style="padding: 10px 12px; background: #fff; border: 1px solid #E5E7EB; color: #1F2937;">${opts.applicantName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; background: #F9FAFB; border: 1px solid #E5E7EB; font-weight: 600; color: #6B7280;">File Number</td>
            <td style="padding: 10px 12px; background: #F9FAFB; border: 1px solid #E5E7EB; color: #1F2937;">${opts.fileNumber}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; background: #fff; border: 1px solid #E5E7EB; font-weight: 600; color: #6B7280;">Status</td>
            <td style="padding: 10px 12px; background: #fff; border: 1px solid #E5E7EB;">
              <span style="display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 13px; font-weight: 600;
                background: ${isEnabled ? "#dcfce7" : "#fee2e2"};
                color: ${isEnabled ? "#15803d" : "#dc2626"};">
                Monitoring ${isEnabled ? "ON" : "OFF"}
              </span>
            </td>
          </tr>
          ${opts.changedBy ? `
          <tr>
            <td style="padding: 10px 12px; background: #F9FAFB; border: 1px solid #E5E7EB; font-weight: 600; color: #6B7280;">Changed By</td>
            <td style="padding: 10px 12px; background: #F9FAFB; border: 1px solid #E5E7EB; color: #1F2937;">${opts.changedBy}</td>
          </tr>` : ""}
        </table>
        <p style="margin: 0; color: #6B7280; font-size: 12px;">
          This is an automated notification from the SaffHire Dashboard.
        </p>
      </div>
    </div>
  `;

  const textBody = [
    `SaffHire Monitoring Alert`,
    ``,
    `Monitor status has been ${actionWord} for:`,
    `  Applicant Name: ${opts.applicantName}`,
    `  File Number:    ${opts.fileNumber}`,
    `  Status:         Monitoring ${opts.newStatus}`,
    opts.changedBy ? `  Changed By:     ${opts.changedBy}` : "",
    ``,
    `This is an automated notification from the SaffHire Dashboard.`,
  ].filter((l) => l !== undefined).join("\n");

  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"SaffHire Dashboard" <${from}>`,
    to: opts.recipients.join(", "),
    subject,
    text: textBody,
    html: htmlBody,
  });
}

/**
 * Verify SMTP connection — used in tests and health checks.
 * Returns true if credentials are valid, false otherwise.
 */
export async function verifySMTPConnection(): Promise<boolean> {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    return true;
  } catch {
    return false;
  }
}
