import fs from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";

const SUBJECT = "Sponsoring-Anfrage für HTWG Scavengerhunt";
const FOLLOW_UP_SUBJECT = "Kurze Nachfrage zur Sponsoring-Anfrage";

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

export async function checkGmailAccess(gmail) {
  try {
    await gmail.users.getProfile({ userId: "me" });
    return true;
  } catch (error) {
    if (isGmailAuthError(error)) return false;
    throw error;
  }
}

export function isGmailAuthError(error) {
  const message = String(error?.message || "");
  const errors = error?.errors || [];

  return error?.code === 401
    || message.includes("invalid_grant")
    || errors.some((item) => item?.reason === "authError" || item?.message?.includes("invalid_grant"));
}

export async function createDraft(gmail, { to, body, attachmentPath, leadId, subject = SUBJECT, replyMessageId = null }) {
  const sender = requiredEnv("GMAIL_SENDER_EMAIL");
  const raw = await buildRawMessage({
    from: sender,
    to,
    subject,
    body,
    attachmentPath,
    headers: {
      "X-Notion-Page-Id": leadId,
      "X-CRM-Automation": "sponsor-crm-automation"
    }
  });

  const requestBody = {
    message: { raw }
  };

  if (replyMessageId) {
    requestBody.message.threadId = replyMessageId;
  }

  const response = await gmail.users.drafts.create({
    userId: "me",
    requestBody
  });

  return {
    id: response.data.id,
    messageId: response.data.message?.id,
    threadId: response.data.message?.threadId,
    link: "https://mail.google.com/mail/u/0/#drafts"
  };
}

export async function createFollowUpDraft(gmail, lead) {
  const body = [
    "Sehr geehrte Damen und Herren,",
    "",
    "ich wollte mich kurz nach meiner Sponsoring-Anfrage zur HTWG Scavengerhunt erkundigen.",
    "",
    "Falls eine Unterstützung unserer Veranstaltung mit passenden Preisen, zum Beispiel Eintrittskarten oder Gutscheinen, für Sie grundsätzlich vorstellbar ist, freuen wir uns sehr über eine kurze Rückmeldung.",
    "",
    "Vielen Dank und freundliche Grüße",
    "",
    "Silvan Dorner",
    "HTWG Scavengerhunt Team"
  ].join("\n");

  return createDraft(gmail, {
    to: lead.contactEmail,
    body,
    leadId: lead.id,
    subject: FOLLOW_UP_SUBJECT
  });
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

export async function findManualSentMessage(gmail, lead, { allowSearchFallback = true } = {}) {
  if (!lead.contactEmail) return null;

  const sentMessageInThread = await findSentMessageInThread(gmail, lead);
  if (sentMessageInThread) return sentMessageInThread;

  if (!allowSearchFallback) return null;

  const query = [
    "in:sent",
    `to:${lead.contactEmail}`,
    `subject:"${SUBJECT}"`,
    "newer_than:180d"
  ].join(" ");

  const messages = await listMessages(gmail, query, 10);

  for (const message of messages) {
    const sent = await getMessageMetadata(gmail, message.id, [
      "Date",
      "To",
      "Subject",
      "X-Notion-Page-Id"
    ]);

    if (matchesSentLead(sent, lead)) {
      return {
        id: sent.id,
        threadId: sent.threadId,
        sentAt: parseGmailDate(sent.headers.Date)
      };
    }
  }

  return null;
}

async function findSentMessageInThread(gmail, lead) {
  if (!lead.gmailThreadId) return null;

  try {
    const response = await gmail.users.threads.get({
      userId: "me",
      id: lead.gmailThreadId,
      format: "metadata",
      metadataHeaders: ["Date", "To", "Subject", "X-Notion-Page-Id"]
    });

    const sentMessage = (response.data.messages || [])
      .map((message) => ({
        id: message.id,
        threadId: message.threadId,
        labelIds: message.labelIds || [],
        headers: Object.fromEntries(
          (message.payload?.headers || []).map((header) => [header.name, header.value])
        )
      }))
      .find((message) => message.labelIds.includes("SENT") && matchesSentLead(message, lead));

    if (!sentMessage) return null;

    return {
      id: sentMessage.id,
      threadId: sentMessage.threadId,
      sentAt: parseGmailDate(sentMessage.headers.Date)
    };
  } catch (error) {
    if (error?.code === 404) return null;
    throw error;
  }
}

export async function findReplyToLead(gmail, lead) {
  if (!lead.contactEmail || !lead.sentAt || lead.replyDetectedAt) return null;

  const domain = lead.contactEmail.split("@")[1];
  const after = formatGmailAfterDate(lead.sentAt);
  const queries = [
    `from:${lead.contactEmail} subject:"${SUBJECT}" after:${after}`,
    domain ? `from:${domain} subject:"${SUBJECT}" after:${after}` : null
  ].filter(Boolean);

  for (const query of queries) {
    const messages = await listMessages(gmail, query, 5);
    for (const message of messages) {
      const reply = await getMessageMetadata(gmail, message.id, ["Date", "From", "To", "Subject", "Auto-Submitted", "Precedence"]);
      const from = reply.headers.From || "";
      if (!from.toLowerCase().includes(requiredEnv("GMAIL_SENDER_EMAIL").toLowerCase()) && !isAutomaticReply(reply.headers)) {
        return {
          id: reply.id,
          threadId: reply.threadId,
          receivedAt: parseGmailDate(reply.headers.Date)
        };
      }
    }
  }

  return null;
}

function isAutomaticReply(headers) {
  const autoSubmitted = headers["Auto-Submitted"] || "";
  const precedence = headers.Precedence || "";
  return autoSubmitted.toLowerCase().includes("auto") || ["bulk", "list", "junk"].includes(precedence.toLowerCase());
}

async function listMessages(gmail, query, maxResults) {
  const list = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults
  });

  return list.data.messages || [];
}

async function getMessageMetadata(gmail, id, headers) {
  const response = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "metadata",
    metadataHeaders: headers
  });

  return {
    id: response.data.id,
    threadId: response.data.threadId,
    headers: Object.fromEntries(
      (response.data.payload?.headers || []).map((header) => [header.name, header.value])
    )
  };
}

function matchesSentLead(message, lead) {
  const subject = message.headers.Subject || "";
  const recipient = message.headers.To || "";
  const notionPageId = message.headers["X-Notion-Page-Id"] || "";

  if (notionPageId && notionPageId === lead.id) return true;
  if (lead.gmailThreadId && message.threadId === lead.gmailThreadId) return true;

  return subject === SUBJECT && recipient.toLowerCase().includes(lead.contactEmail.toLowerCase());
}

async function buildRawMessage({ from, to, subject, body, attachmentPath, headers = {} }) {
  if (!attachmentPath) {
    const lines = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${encodeSubject(subject)}`,
      ...headerLines(headers),
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      chunkBase64(Buffer.from(body, "utf8").toString("base64"))
    ];

    return base64UrlEncode(lines.join("\r\n"));
  }

  const boundary = `sponsor-crm-${Date.now()}`;
  const attachment = await fs.readFile(attachmentPath);
  const filename = path.basename(attachmentPath);

  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    ...headerLines(headers),
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

function headerLines(headers) {
  return Object.entries(headers)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`);
}

function parseGmailDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function formatGmailAfterDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "1970/01/01";
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("/");
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

export { FOLLOW_UP_SUBJECT, SUBJECT };
