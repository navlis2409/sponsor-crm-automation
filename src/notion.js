import { Client } from "@notionhq/client";

export const PROPERTIES = {
  company: ["Name", "Firmenname", "Sponsor / Unternehmen"],
  website: ["Website"],
  location: ["Location", "Ort"],
  category: ["Industry", "Kategorie"],
  reach: ["Lead Score", "Reichweite"],
  contactEmail: ["Email", "E-Mail", "Kontakt E-Mail"],
  contactPhone: ["Phone", "Telefonnummer", "Kontakt Telefon"],
  contactPerson: ["Ansprechpartner"],
  pipelineStatus: ["Status", "Pipeline Status", "CRM Status"],
  automationStatus: ["Automation Status"],
  gmailDraftLink: ["Gmail Draft Link"],
  gmailDraftId: ["Gmail Draft ID"],
  gmailDraftMessageId: ["Gmail Draft Message ID"],
  gmailThreadId: ["Gmail Thread ID"],
  gmailSentMessageId: ["Gmail Sent Message ID", "Gmail Message ID"],
  sentAt: ["Gesendet am", "Last Contacted"],
  lastContacted: ["Last Contacted", "Gesendet am"],
  linkedin: ["LinkedIn", "LinkedIn Unternehmensprofil"],
  dataSource: ["Datenquelle"],
  dataQuality: ["Datenqualität", "Datenqualitaet"],
  lastUpdated: ["Letzte Aktualisierung"],
  automationError: ["Automation Error"],
  followUpDraftId: ["Follow-up Draft ID", "Follow Up Draft ID"],
  followUpCreatedAt: ["Follow-up erstellt am", "Follow Up Created At"],
  replyDetectedAt: ["Antwort erkannt am"],
  notes: ["Notizen", "Notes"]
};

export const AUTOMATION_STATUS = {
  NEW: "Neu",
  ENRICHED: "Daten ergänzt",
  REVIEW: "Prüfen",
  DRAFT_CREATED: "Entwurf erstellt",
  CONTACTED: "Contacted Email",
  ERROR: "Fehler"
};

export const PIPELINE_STATUS = {
  LEAD: "Lead",
  CONTACTED_EMAIL: "E-Mail / Contacted",
  INTERESTED: "Interested",
  CLOSED_LOST: "Closed-Lost"
};

export const DATA_QUALITY = {
  COMPLETE: "Vollständig",
  PARTIAL: "Teilweise",
  INCOMPLETE: "Unvollständig"
};

export function createNotionClient() {
  return new Client({ auth: requiredEnv("NOTION_API_KEY") });
}

export async function getLeadsForAutomation(notion) {
  const pages = await queryAllDatabasePages(notion, {
    or: [
      selectFilter("automationStatus", AUTOMATION_STATUS.NEW),
      selectFilter("automationStatus", AUTOMATION_STATUS.ENRICHED)
    ]
  });

  return pages.map(mapLead);
}

export async function getDraftedLeads(notion) {
  const pages = await queryAllDatabasePages(notion, selectFilter("automationStatus", AUTOMATION_STATUS.DRAFT_CREATED));
  return pages.map(mapLead);
}

export async function getContactedEmailLeads(notion) {
  const pages = await queryAllDatabasePages(notion, selectFilter("automationStatus", AUTOMATION_STATUS.CONTACTED));
  return pages.map(mapLead);
}

export async function findExistingLeadByWebsiteOrEmail(notion, lead) {
  const filters = [];

  const websiteProperty = resolvePropertyName(lead, "website");
  if (lead.website && websiteProperty) {
    filters.push({ property: websiteProperty, url: { equals: lead.website } });
  }

  const emailProperty = resolvePropertyName(lead, "contactEmail");
  if (lead.contactEmail && emailProperty) {
    filters.push({ property: emailProperty, email: { equals: lead.contactEmail } });
  }

  if (filters.length === 0) return null;

  const pages = await queryAllDatabasePages(notion, { or: filters });
  const duplicate = pages
    .map(mapLead)
    .find((candidate) => candidate.id !== lead.id);

  return duplicate || null;
}

export async function updateLeadAfterEnrichment(notion, lead, enrichment, duplicate) {
  const quality = duplicate
    ? DATA_QUALITY.INCOMPLETE
    : enrichment.dataQuality;

  const notes = [
    duplicate ? `Möglicher Duplikat-Lead gefunden: ${duplicate.company || duplicate.id}` : null,
    enrichment.reason,
    enrichment.sources?.length ? `Datenquelle: ${enrichment.sources.join(", ")}` : null
  ].filter(Boolean).join("\n");

  const patch = createLeadPatch(lead);
  patch.setIfEmpty("company", titleValue(enrichment.company));
  patch.setIfEmpty("contactEmail", emailValue(enrichment.email));
  patch.setIfEmpty("contactPhone", phoneValue(enrichment.phone));
  patch.setIfEmpty("contactPerson", richText(enrichment.person));
  patch.setIfEmpty("linkedin", urlValue(enrichment.linkedin));
  patch.set("dataSource", richText(enrichment.sources?.join("\n") || ""));
  patch.set("dataQuality", selectValue(quality));
  patch.set("lastUpdated", dateValue(new Date().toISOString()));
  patch.set("automationError", richText(""));

  if (notes) {
    patch.set("notes", richText(appendNote(lead.notes, notes)));
  }

  if (duplicate) {
    patch.set("automationStatus", selectValue(AUTOMATION_STATUS.REVIEW));
    patch.set("automationError", richText("Möglicher Duplikat-Lead. Bitte manuell prüfen."));
  } else if (!enrichment.email) {
    patch.set("automationStatus", selectValue(AUTOMATION_STATUS.REVIEW));
  } else {
    patch.set("automationStatus", selectValue(AUTOMATION_STATUS.ENRICHED));
    patch.setIfEmpty("pipelineStatus", selectLikeValue(lead.pipelineStatusType, PIPELINE_STATUS.LEAD));
  }

  await patch.apply(notion);
}

export async function markNeedsReview(notion, lead, reason) {
  const patch = createLeadPatch(lead);
  patch.set("automationStatus", selectValue(AUTOMATION_STATUS.REVIEW));
  patch.set("dataQuality", selectValue(DATA_QUALITY.INCOMPLETE));
  patch.set("automationError", richText(reason));
  patch.set("notes", richText(appendNote(lead.notes, reason)));
  await patch.apply(notion);
}

export async function markLeadError(notion, lead, error) {
  const message = error?.message || String(error);
  const patch = createLeadPatch(lead);
  patch.set("automationStatus", selectValue(AUTOMATION_STATUS.ERROR));
  patch.set("automationError", richText(message));
  patch.set("notes", richText(appendNote(lead.notes, `Automation-Fehler: ${message}`)));
  await patch.apply(notion);
}

export async function updateLeadAfterDraft(notion, lead, draftResult, research, attachmentPath, personalizationReason) {
  const notes = appendNote(
    lead.notes,
    [
      "Gmail-Entwurf erstellt, kein automatischer Versand.",
      `Verwendete Kontaktadresse: ${research.email}`,
      research.phone ? `Gefundene Telefonnummer: ${research.phone}` : "Gefundene Telefonnummer: keine sichere offizielle Telefonnummer gefunden",
      research.person ? `Ansprechpartner: ${research.person}` : "Ansprechpartner: kein sicherer offizieller Ansprechpartner gefunden",
      research.linkedin ? `LinkedIn: ${research.linkedin}` : null,
      `Quelle der Kontaktdaten: ${(research.sources || []).join(", ")}`,
      `Gewählter Anhang: ${attachmentPath}`,
      `Personalisierung: ${personalizationReason}`
    ].filter(Boolean).join("\n")
  );

  const patch = createLeadPatch(lead);
  patch.setIfEmpty("contactEmail", emailValue(research.email));
  patch.setIfEmpty("contactPhone", phoneValue(research.phone));
  patch.setIfEmpty("contactPerson", richText(research.person));
  patch.setIfEmpty("linkedin", urlValue(research.linkedin));
  patch.set("automationStatus", selectValue(AUTOMATION_STATUS.DRAFT_CREATED));
  patch.set("gmailDraftId", richText(draftResult.id));
  patch.set("gmailDraftMessageId", richText(draftResult.messageId));
  patch.set("gmailThreadId", richText(draftResult.threadId));
  patch.set("gmailDraftLink", urlValue(draftResult.link));
  patch.set("dataSource", richText((research.sources || []).join("\n")));
  patch.set("dataQuality", selectValue(research.dataQuality || DATA_QUALITY.COMPLETE));
  patch.set("lastUpdated", dateValue(new Date().toISOString()));
  patch.set("automationError", richText(""));
  patch.set("notes", richText(notes));
  patch.setIfEmpty("pipelineStatus", selectLikeValue(lead.pipelineStatusType, PIPELINE_STATUS.LEAD));
  await patch.apply(notion);
}

export async function updateLeadAfterManualSend(notion, lead, sentMessage) {
  const notes = appendNote(lead.notes, "E-Mail wurde manuell versendet.");
  const patch = createLeadPatch(lead);
  patch.set("automationStatus", selectValue(AUTOMATION_STATUS.CONTACTED));
  if (!lead.pipelineStatus || lead.pipelineStatus === PIPELINE_STATUS.LEAD) {
    patch.set("pipelineStatus", selectLikeValue(lead.pipelineStatusType, PIPELINE_STATUS.CONTACTED_EMAIL));
  }
  patch.set("sentAt", dateValue(sentMessage.sentAt));
  patch.set("lastContacted", dateValue(sentMessage.sentAt));
  patch.set("gmailSentMessageId", richText(sentMessage.id));
  patch.set("gmailThreadId", richText(sentMessage.threadId));
  patch.set("automationError", richText(""));
  patch.set("notes", richText(notes));
  await patch.apply(notion);
}

export async function updateLeadAfterFollowUpDraft(notion, lead, draftResult) {
  const patch = createLeadPatch(lead);
  patch.set("followUpDraftId", richText(draftResult.id));
  patch.set("followUpCreatedAt", dateValue(new Date().toISOString()));
  patch.set("notes", richText(appendNote(lead.notes, "Follow-up-Entwurf erstellt, kein automatischer Versand."));
  await patch.apply(notion);
}

export async function updateLeadAfterReply(notion, lead, reply) {
  const patch = createLeadPatch(lead);
  patch.set("replyDetectedAt", dateValue(reply.receivedAt));
  patch.set("notes", richText(appendNote(lead.notes, `Antwort vom Sponsor erkannt. Bitte prüfen.\nGmail Message ID: ${reply.id}`)));
  if (!lead.pipelineStatus || lead.pipelineStatus === PIPELINE_STATUS.CONTACTED_EMAIL) {
    patch.set("pipelineStatus", selectLikeValue(lead.pipelineStatusType, PIPELINE_STATUS.INTERESTED));
  }
  await patch.apply(notion);
}

async function queryAllDatabasePages(notion, filter) {
  const pages = [];
  let cursor;

  do {
    const request = {
      database_id: requiredEnv("NOTION_DATABASE_ID"),
      start_cursor: cursor
    };

    if (filter) request.filter = Array.isArray(filter) ? { or: filter } : filter;

    const response = await notion.databases.query(request);
    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return pages;
}

function selectFilter(key, value) {
  const property = PROPERTIES[key][0];
  return {
    property,
    select: { equals: value }
  };
}

function createLeadPatch(lead) {
  const properties = {};

  return {
    set(key, value) {
      if (value === undefined) return;
      const propertyName = resolvePropertyName(lead, key);
      if (!propertyName) return;
      properties[propertyName] = value;
    },
    setIfEmpty(key, value) {
      if (value === undefined) return;
      if (hasLeadValue(lead, key)) return;
      const propertyName = resolvePropertyName(lead, key);
      if (!propertyName) return;
      properties[propertyName] = value;
    },
    async apply(notion) {
      if (Object.keys(properties).length === 0) return;
      await notion.pages.update({
        page_id: lead.id,
        properties
      });
    }
  };
}

function resolvePropertyName(lead, key) {
  const existing = lead.propertyNames || {};
  if (existing[key]) return existing[key];
  return null;
}

function hasLeadValue(lead, key) {
  const value = lead[key];
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function mapLead(page) {
  const properties = page.properties;
  const propertyNames = resolvePropertyNames(properties);
  const pipelineProperty = properties[propertyNames.pipelineStatus];

  return {
    id: page.id,
    propertyNames,
    company: readTitle(properties[propertyNames.company]) || readPlainText(properties.Company),
    website: readUrlOrText(properties[propertyNames.website]),
    location: readPlainText(properties[propertyNames.location]),
    category: readSelectLike(properties[propertyNames.category]),
    reach: readNumberOrText(properties[propertyNames.reach]),
    contactEmail: readEmailOrText(properties[propertyNames.contactEmail]),
    contactPhone: readPhoneOrText(properties[propertyNames.contactPhone]),
    contactPerson: readPlainText(properties[propertyNames.contactPerson]),
    pipelineStatus: readSelectLike(pipelineProperty),
    pipelineStatusType: pipelineProperty?.type || "select",
    automationStatus: readSelectLike(properties[propertyNames.automationStatus]),
    gmailDraftLink: readUrlOrText(properties[propertyNames.gmailDraftLink]),
    gmailDraftId: readPlainText(properties[propertyNames.gmailDraftId]),
    gmailDraftMessageId: readPlainText(properties[propertyNames.gmailDraftMessageId]),
    gmailThreadId: readPlainText(properties[propertyNames.gmailThreadId]),
    gmailSentMessageId: readPlainText(properties[propertyNames.gmailSentMessageId]),
    sentAt: readDate(properties[propertyNames.sentAt]),
    lastContacted: readDate(properties[propertyNames.lastContacted]),
    linkedin: readUrlOrText(properties[propertyNames.linkedin]),
    dataSource: readPlainText(properties[propertyNames.dataSource]),
    dataQuality: readSelectLike(properties[propertyNames.dataQuality]),
    lastUpdated: readDate(properties[propertyNames.lastUpdated]),
    automationError: readPlainText(properties[propertyNames.automationError]),
    followUpDraftId: readPlainText(properties[propertyNames.followUpDraftId]),
    followUpCreatedAt: readDate(properties[propertyNames.followUpCreatedAt]),
    replyDetectedAt: readDate(properties[propertyNames.replyDetectedAt]),
    notes: readPlainText(properties[propertyNames.notes])
  };
}

function resolvePropertyNames(properties) {
  return Object.fromEntries(
    Object.entries(PROPERTIES).map(([key, candidates]) => [
      key,
      candidates.find((candidate) => Boolean(properties[candidate]))
    ])
  );
}

function readTitle(property) {
  if (!property) return "";
  return plain(property.title);
}

function readPlainText(property) {
  if (!property) return "";
  if (property.rich_text) return plain(property.rich_text);
  if (property.title) return plain(property.title);
  if (property.plain_text) return property.plain_text;
  return "";
}

function readUrlOrText(property) {
  if (!property) return "";
  return property.url || readPlainText(property);
}

function readEmailOrText(property) {
  if (!property) return "";
  return property.email || readPlainText(property);
}

function readPhoneOrText(property) {
  if (!property) return "";
  return property.phone_number || readPlainText(property);
}

function readNumberOrText(property) {
  if (!property) return "";
  if (typeof property.number === "number") return String(property.number);
  return readPlainText(property);
}

function readSelectLike(property) {
  if (!property) return "";
  if (property.select) return property.select?.name || "";
  if (property.status) return property.status?.name || "";
  if (property.multi_select) return property.multi_select.map((item) => item.name).join(", ");
  return readPlainText(property);
}

function readDate(property) {
  return property?.date?.start || "";
}

function plain(items = []) {
  return items.map((item) => item.plain_text || "").join("").trim();
}

function richText(value) {
  if (!value) {
    return { rich_text: [] };
  }

  return {
    rich_text: chunkText(value, 1900).map((content) => ({
      type: "text",
      text: { content }
    }))
  };
}

function titleValue(value) {
  if (!value) return undefined;
  return {
    title: [
      {
        type: "text",
        text: { content: value }
      }
    ]
  };
}

function emailValue(value) {
  if (!value) return undefined;
  return { email: value };
}

function phoneValue(value) {
  if (!value) return undefined;
  return { phone_number: value };
}

function urlValue(value) {
  if (!value) return undefined;
  return { url: value };
}

function dateValue(value) {
  if (!value) return undefined;
  return { date: { start: value } };
}

function selectValue(name) {
  return name ? { select: { name } } : undefined;
}

function selectLikeValue(type, name) {
  if (!name) return undefined;
  if (type === "status") return { status: { name } };
  return { select: { name } };
}

function appendNote(existingNotes, addition) {
  const timestamp = new Date().toISOString();
  const block = `[${timestamp}]\n${addition}`;
  return existingNotes ? `${existingNotes}\n\n${block}` : block;
}

function chunkText(value, maxLength) {
  const chunks = [];
  for (let index = 0; index < value.length && chunks.length < 50; index += maxLength) {
    chunks.push(value.slice(index, index + maxLength));
  }
  return chunks;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
