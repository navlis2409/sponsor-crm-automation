import "dotenv/config";
import fs from "node:fs/promises";
import { createNotionClient, getLeadsByStatus, markNeedsReview, updateLeadAfterDraft, updateLeadAfterManualSend } from "./notion.js";
import { createGmailClient, createDraft, draftExists, findManualSentMessage } from "./gmail.js";
import { researchBusinessContact } from "./contactResearch.js";
import { buildEmailBody } from "./emailTemplate.js";
import { describeAttachment, selectAttachment } from "./attachmentSelector.js";

async function main() {
  validateEnvironment();

  const notion = createNotionClient();
  const gmail = createGmailClient();

  await processNewLeads(notion, gmail);
  await processDraftedLeads(notion, gmail);
}

async function processNewLeads(notion, gmail) {
  const leads = await getLeadsByStatus(notion, "Neu");
  console.log(`Neue Leads gefunden: ${leads.length}`);

  for (const lead of leads) {
    try {
      await processNewLead(notion, gmail, lead);
    } catch (error) {
      console.error(`Lead konnte nicht verarbeitet werden (${lead.id}): ${error.message}`);
    }
  }
}

async function processNewLead(notion, gmail, lead) {
  console.log(`Verarbeite neuen Lead: ${lead.company || lead.id}`);

  const research = await researchBusinessContact(lead);
  if (!research.email) {
    await markNeedsReview(
      notion,
      lead,
      [
        "Kein Gmail-Entwurf erstellt.",
        research.reason,
        research.sources.length > 0 ? `Gepruefte Quellen: ${research.sources.join(", ")}` : "Keine offiziellen Quellen erfolgreich lesbar."
      ].join("\n")
    );
    return;
  }

  const attachmentPath = selectAttachment(lead);
  await ensureFileExists(attachmentPath);

  const email = buildEmailBody(lead, research);
  const draftResult = await createDraft(gmail, {
    to: research.email,
    body: email.body,
    attachmentPath
  });

  await updateLeadAfterDraft(
    notion,
    lead,
    draftResult,
    research,
    describeAttachment(attachmentPath),
    email.personalizationReason
  );
}

async function processDraftedLeads(notion, gmail) {
  const leads = await getLeadsByStatus(notion, "Entwurf erstellt");
  console.log(`Leads mit Entwurf gefunden: ${leads.length}`);

  for (const lead of leads) {
    try {
      await processDraftedLead(notion, gmail, lead);
    } catch (error) {
      console.error(`Entwurfsstatus konnte nicht geprueft werden (${lead.id}): ${error.message}`);
    }
  }
}

async function processDraftedLead(notion, gmail, lead) {
  if (!lead.gmailDraftId) {
    console.warn(`Lead ohne Gmail Draft ID uebersprungen: ${lead.id}`);
    return;
  }

  const stillDraft = await draftExists(gmail, lead.gmailDraftId);
  if (stillDraft) {
    return;
  }

  const sentMessage = await findManualSentMessage(gmail, lead);
  if (!sentMessage) {
    return;
  }

  await updateLeadAfterManualSend(notion, lead, sentMessage.sentAt);
}

function validateEnvironment() {
  const required = [
    "NOTION_API_KEY",
    "NOTION_DATABASE_ID",
    "GMAIL_CLIENT_ID",
    "GMAIL_CLIENT_SECRET",
    "GMAIL_REFRESH_TOKEN",
    "GMAIL_SENDER_EMAIL"
  ];

  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

async function ensureFileExists(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Attachment fehlt: ${filePath}`);
  }
}

main().catch((error) => {
  console.error(`Automation fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});
