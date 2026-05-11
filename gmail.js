import fs from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";

const SUBJECT = "Sponsoring-Anfrage für HTWG Scavengerhunt";

export function createGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    requiredEnv("GMAIL_CLIENT_ID"),
    requiredEnv("GMAIL_CLIENT_SECRET")
  );

  oauth2Client.setCredentials({
    refresh_token: requiredEnv("GMAIL_REFRESH_TOKEN")
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

export async function createDraft(gmail, { to, body, attachmentPath }) {
  const sender = requiredEnv("GMAIL_SENDER_EMAIL");
  const raw = await buildRawMessage({
    from: sender,
    to,
    subject: SUBJECT,
    body,
    attachmentPath
  });

  const response = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { raw }
    }
  });

  return {
    id: response.data.id,
    messageId: response.data.message?.id,
    link: "https://mail.google.com/mail/u/0/#drafts"
  };
}

export async function draftExists(gmail, draftId) {
  if (!draftId) return false;

  try {
    await gmail.users.drafts.get({
      userId: "me",
      id: draftId,
      format: "minimal"
    });

    return true;
  } catch (error) {
    if (error?.code === 404) return false;
    throw error;
  }
}

export async function findManualSentMessage(gmail, lead) {
  const to = lead.contactEmail;
  if (!to) return null;

  const query = [
    "in:sent",
    `to:${to}`,
    `subject:\"${SUBJECT}\"`
  ].join(" ");

  const list = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 10
  });

  const messages = list.data.messages || [];
  if (messages.length === 0) return null;

  for (const message of messages) {
    const response = await gmail.users.messages.get({
      userId: "me",
      id: message.id,
      format: "metadata",
      metadataHeaders: ["Date", "To", "Subject"]
    });

    const headers = response.data.payload?.headers || [];
    const subject = getHeader(headers, "Subject");
    const recipient = getHeader(headers, "To");

    if (subject === SUBJECT && recipient.toLowerCase().includes(to.toLowerCase())) {
      return {
        id: response.data.id,
        sentAt: parseGmailDate(getHeader(headers, "Date"))
      };
    }
  }

  return null;
}

async function buildRawMessage({ from, to, subject, body, attachmentPath }) {
  const boundary = `sponsor-crm-${Date.now()}`;
  const attachment = await fs.readFile(attachmentPath);
  const filename = path.basename(attachmentPath);

  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    chunkBase64(Buffer.from(body, "utf8").toString("base64")),
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${filename}"`,
    "",
    chunkBase64(attachment.toString("base64")),
    "",
    `--${boundary}--`
  ];

  return base64UrlEncode(lines.join("\r\n"));
}

function getHeader(headers, name) {
  return headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function parseGmailDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function encodeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function chunkBase64(value) {
  return value.match(/.{1,76}/g)?.join("\r\n") || "";
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export { SUBJECT };
