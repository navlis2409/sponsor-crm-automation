import "dotenv/config";
import fs from "node:fs/promises";
import {
  AUTOMATION_STATUS,
  createNotionClient,
  findExistingLeadByWebsiteOrEmail,
  getContactedEmailLeads,
  getDraftedLeads,
  getLeadsForAutomation,
  markLeadError,
  markNeedsReview,
  updateLeadAfterDraft,
  updateLeadAfterEnrichment,
  updateLeadAfterFollowUpDraft,
  updateLeadAfterManualSend,
  updateLeadAfterReply
} from "./notion.js";
import {
  createDraft,
  createFollowUpDraft,
  createGmailClient,
  draftExists,
  findManualSentMessage,
  findReplyToLead
} from "./gmail.js";
import { researchBusinessContact } from "./contactResearch.js";
import { buildEmailBody } from "./emailTemplate.js";
import { describeAttachment, selectAttachment } from "./attachmentSelector.js";

const FOLLOW_UP_AFTER_DAYS = 7;

async function main() {
  validateEnvironment();

  const notion = createNotionClient();
  const gmail = createGmailClient();

  await processLeadPipeline(notion, gmail);
  await processDraftedLeads(notion, gmail);
  await processContactedLeads(notion, gmail);
}

async function processLeadPipeline(notion, gmail) {
  const leads = await getLeadsForAutomation(notion);
  console.log(`Leads für Automatisierung gefunden: ${leads.length}`);

  for (const lead of leads) {
    try {
      await processLead(notion, gmail, lead);
    } catch (error) {
      console.error(`Lead konnte nicht verarbeitet werden (${lead.id}): ${error.message}`);
      await safelyMarkLeadError(notion, lead, error);
    }
  }
}

async function processLead(notion, gmail, lead) {
  console.log(`Verarbeite Lead: ${lead.company || lead.website || lead.id}`);

  if (!lead.website && !lead.contactEmail) {
    await markNeedsReview(notion, lead, "Keine Website und keine Kontakt-E-Mail vorhanden.");
    return;
  }

  let enrichedLead = lead;
  let research = null;

  if (shouldEnrichLead(lead)) {
    research = await researchBusinessContact(lead);
    enrichedLead = mergeLeadWithResearch(lead, research);

    const duplicate = await findExistingLeadByWebsiteOrEmail(notion, enrichedLead);
    await updateLeadAfterEnrichment(notion, lead, research, duplicate);

    if (duplicate) return;
    if (!research.email && !lead.contactEmail) return;
  }

  const contactEmail = enrichedLead.contactEmail || research?.email;
  if (!contactEmail) {
    await markNeedsReview(notion, lead, "Keine sichere geschäftliche E-Mail-Adresse gefunden. Kein Gmail-Entwurf erstellt.");
    return;
  }

  if (lead.gmailDraftId || lead.automationStatus === AUTOMATION_STATUS.DRAFT_CREATED) {
    return;
  }

  const attachmentPath = selectAttachment(enrichedLead);
  await ensureFileExists(attachmentPath);

  const email = buildEmailBody(enrichedLead, research || {});
  const draftResult = await createDraft(gmail, {
    to: contactEmail,
    body: email.body,
    attachmentPath,
    leadId: lead.id
  });

  await updateLeadAfterDraft(
    notion,
    enrichedLead,
    draftResult,
    {
      ...(research || {}),
      email: contactEmail,
      phone: enrichedLead.contactPhone || research?.phone,
      person: enrichedLead.contactPerson || research?.person,
      linkedin: enrichedLead.linkedin || research?.linkedin,
      sources: research?.sources || [enrichedLead.website].filter(Boolean)
    },
    describeAttachment(attachmentPath),
    email.personalizationReason
  );
}

async function processDraftedLeads(notion, gmail) {
  const leads = await getDraftedLeads(notion);
  console.log(`Leads mit Entwurf gefunden: ${leads.length}`);

  for (const lead of leads) {
    try {
      await processDraftedLead(notion, gmail, lead);
    } catch (error) {
      console.error(`Entwurfsstatus konnte nicht geprüft werden (${lead.id}): ${error.message}`);
      await safelyMarkLeadError(notion, lead, error);
    }
  }
}

async function processDraftedLead(notion, gmail, lead) {
  if (!lead.gmailDraftId) {
    console.warn(`Lead ohne Gmail Draft ID übersprungen: ${lead.id}`);
    return;
  }

  const sentMessageInThread = await findManualSentMessage(gmail, lead, { allowSearchFallback: false });
  if (sentMessageInThread) {
    await updateLeadAfterManualSend(notion, lead, sentMessageInThread);
    return;
  }

  const stillDraft = await draftExists(gmail, lead.gmailDraftId);
  if (stillDraft) {
    console.log(`Gmail-Entwurf existiert noch, Lead bleibt unveraendert: ${lead.company || lead.id}`);
    return;
  }

  const sentMessage = await findManualSentMessage(gmail, lead);
  if (!sentMessage) {
    console.log(`Keine passende gesendete Gmail-Nachricht gefunden: ${lead.company || lead.id}`);
    return;
  }

  await updateLeadAfterManualSend(notion, lead, sentMessage);
}

async function processContactedLeads(notion, gmail) {
  const leads = await getContactedEmailLeads(notion);
  console.log(`Kontaktierte Leads gefunden: ${leads.length}`);

  for (const lead of leads) {
    try {
      await processContactedLead(notion, gmail, lead);
    } catch (error) {
      console.error(`Kontaktierter Lead konnte nicht geprüft werden (${lead.id}): ${error.message}`);
      await safelyMarkLeadError(notion, lead, error);
    }
  }
}

async function processContactedLead(notion, gmail, lead) {
  if (lead.pipelineStatus === "Interested") return;

  const reply = await findReplyToLead(gmail, lead);
  if (reply) {
    await updateLeadAfterReply(notion, lead, reply);
    return;
  }

  if (!shouldCreateFollowUpDraft(lead)) return;

  const draftResult = await createFollowUpDraft(gmail, lead);
  await updateLeadAfterFollowUpDraft(notion, lead, draftResult);
}

function shouldEnrichLead(lead) {
  if (!lead.website) return false;
  if (lead.automationStatus === AUTOMATION_STATUS.NEW) return true;
  if (!lead.company || !lead.contactEmail || !lead.contactPhone) return true;
  return isOlderThanDays(lead.lastUpdated, 30);
}

function shouldCreateFollowUpDraft(lead) {
  if (!lead.contactEmail || !lead.sentAt || lead.followUpDraftId || lead.replyDetectedAt) return false;
  if (!lead.propertyNames?.followUpDraftId) return false;
  return isOlderThanDays(lead.sentAt, FOLLOW_UP_AFTER_DAYS);
}

function mergeLeadWithResearch(lead, research) {
  return {
    ...lead,
    company: lead.company || research.company,
    contactEmail: lead.contactEmail || research.email,
    contactPhone: lead.contactPhone || research.phone,
    contactPerson: lead.contactPerson || research.person,
    linkedin: lead.linkedin || research.linkedin
  };
}

function isOlderThanDays(value, days) {
  if (!value) return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return true;
  return Date.now() - date.getTime() >= days * 24 * 60 * 60 * 1000;
}

async function safelyMarkLeadError(notion, lead, error) {
  try {
    await markLeadError(notion, lead, error);
  } catch (markError) {
    console.error(`Fehler konnte nicht in Notion gespeichert werden (${lead.id}): ${markError.message}`);
  }
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
