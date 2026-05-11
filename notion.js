import { Client } from "@notionhq/client";

export const PROPERTIES = {
  company: "Sponsor / Unternehmen",
  website: "Website",
  location: "Ort",
  category: "Kategorie",
  reach: "Reichweite",
  contactEmail: "Kontakt E-Mail",
  contactPhone: "Kontakt Telefon",
  contactPerson: "Ansprechpartner",
  status: "Status",
  gmailDraftLink: "Gmail Draft Link",
  gmailDraftId: "Gmail Draft ID",
  sentAt: "Gesendet am",
  notes: "Notizen"
};

export function createNotionClient() {
  return new Client({ auth: requiredEnv("NOTION_API_KEY") });
}

export async function getLeadsByStatus(notion, status) {
  const pages = [];
  let cursor;

  do {
    const response = await notion.databases.query({
      database_id: requiredEnv("NOTION_DATABASE_ID"),
      start_cursor: cursor,
      filter: {
        property: PROPERTIES.status,
        status: { equals: status }
      }
    });

    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return pages.map(mapLead);
}

export async function markNeedsReview(notion, lead, reason) {
  await updateLead(notion, lead.id, {
    [PROPERTIES.status]: statusValue("Prüfen"),
    [PROPERTIES.notes]: richText(appendNote(lead.notes, reason))
  });
}

export async function updateLeadAfterDraft(notion, lead, draftResult, research, attachmentPath, personalizationReason) {
  const notes = appendNote(
    lead.notes,
    [
      "Gmail-Entwurf erstellt, kein automatischer Versand.",
      `Verwendete Kontaktadresse: ${research.email}`,
      research.phone ? `Gefundene Telefonnummer: ${research.phone}` : "Gefundene Telefonnummer: keine sichere offizielle Telefonnummer gefunden",
      research.person ? `Ansprechpartner: ${research.person}` : "Ansprechpartner: kein sicherer offizieller Ansprechpartner gefunden",
      `Quelle der Kontaktdaten: ${research.sources.join(", ")}`,
      `Gewaehlter Anhang: ${attachmentPath}`,
      `Personalisierung: ${personalizationReason}`
    ].join("\n")
  );

  const properties = {
    [PROPERTIES.contactEmail]: emailValue(research.email),
    [PROPERTIES.status]: statusValue("Entwurf erstellt"),
    [PROPERTIES.gmailDraftId]: richText(draftResult.id),
    [PROPERTIES.gmailDraftLink]: urlValue(draftResult.link),
    [PROPERTIES.notes]: richText(notes)
  };

  if (research.phone) {
    properties[PROPERTIES.contactPhone] = phoneValue(research.phone);
  }

  if (research.person) {
    properties[PROPERTIES.contactPerson] = richText(research.person);
  }

  await updateLead(notion, lead.id, properties);
}

export async function updateLeadAfterManualSend(notion, lead, sentAt) {
  const properties = {
    [PROPERTIES.status]: statusValue("Contacted Email"),
    [PROPERTIES.notes]: richText(appendNote(lead.notes, "E-Mail wurde manuell versendet."))
  };

  if (sentAt) {
    properties[PROPERTIES.sentAt] = { date: { start: sentAt } };
  }

  await updateLead(notion, lead.id, properties);
}

async function updateLead(notion, pageId, properties) {
  await notion.pages.update({
    page_id: pageId,
    properties
  });
}

function mapLead(page) {
  const properties = page.properties;

  return {
    id: page.id,
    company: readTitle(properties[PROPERTIES.company]),
    website: readUrlOrText(properties[PROPERTIES.website]),
    location: readPlainText(properties[PROPERTIES.location]),
    category: readSelectLike(properties[PROPERTIES.category]),
    reach: readSelectLike(properties[PROPERTIES.reach]),
    contactEmail: readEmailOrText(properties[PROPERTIES.contactEmail]),
    contactPhone: readPhoneOrText(properties[PROPERTIES.contactPhone]),
    contactPerson: readPlainText(properties[PROPERTIES.contactPerson]),
    status: readStatus(properties[PROPERTIES.status]),
    gmailDraftLink: readUrlOrText(properties[PROPERTIES.gmailDraftLink]),
    gmailDraftId: readPlainText(properties[PROPERTIES.gmailDraftId]),
    sentAt: readDate(properties[PROPERTIES.sentAt]),
    notes: readPlainText(properties[PROPERTIES.notes])
  };
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

function readSelectLike(property) {
  if (!property) return "";
  if (property.select) return property.select?.name || "";
  if (property.status) return property.status?.name || "";
  if (property.multi_select) return property.multi_select.map((item) => item.name).join(", ");
  return readPlainText(property);
}

function readStatus(property) {
  if (!property) return "";
  return property.status?.name || property.select?.name || "";
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

function emailValue(value) {
  return { email: value || null };
}

function phoneValue(value) {
  return { phone_number: value || null };
}

function urlValue(value) {
  return value ? { url: value } : { url: null };
}

function statusValue(name) {
  return { status: { name } };
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
