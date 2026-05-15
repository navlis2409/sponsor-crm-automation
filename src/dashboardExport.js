import fs from "node:fs/promises";
import path from "node:path";
import { getAllLeads } from "./notion.js";

const DASHBOARD_DIR = "dashboard";

export async function exportDashboardData(notion) {
  const leads = await getAllLeads(notion);

  await fs.mkdir(DASHBOARD_DIR, { recursive: true });

  await writeCsv(
    path.join(DASHBOARD_DIR, "crm-leads.csv"),
    buildLeadRows(leads)
  );
  await writeCsv(
    path.join(DASHBOARD_DIR, "crm-summary.csv"),
    buildSummaryRows(leads)
  );
  await writeCsv(
    path.join(DASHBOARD_DIR, "crm-funnel.csv"),
    buildCountRows(leads, "funnel", (lead) => lead.pipelineStatus || "Ohne Status")
  );
  await writeCsv(
    path.join(DASHBOARD_DIR, "crm-automation-status.csv"),
    buildCountRows(leads, "automationStatus", (lead) => lead.automationStatus || "Ohne Automation Status")
  );
  await writeCsv(
    path.join(DASHBOARD_DIR, "crm-category.csv"),
    buildCountRows(leads, "category", (lead) => lead.category || "Ohne Kategorie")
  );

  console.log(`PowerBI-Dashboard-Daten exportiert: ${leads.length} Leads`);
}

function buildLeadRows(leads) {
  return [...leads].sort(compareLeads).map((lead) => ({
    notionPageId: lead.id,
    company: lead.company,
    website: lead.website,
    location: lead.location,
    category: lead.category,
    reach: lead.reach,
    pipelineStatus: lead.pipelineStatus,
    automationStatus: lead.automationStatus,
    dataQuality: lead.dataQuality,
    hasEmail: Boolean(lead.contactEmail),
    hasPhone: Boolean(lead.contactPhone),
    hasDraft: Boolean(lead.gmailDraftId),
    hasSentMessage: Boolean(lead.gmailSentMessageId || lead.sentAt || lead.lastContacted),
    hasReply: Boolean(lead.replyDetectedAt),
    hasFollowUpDraft: Boolean(lead.followUpDraftId),
    hasError: Boolean(lead.automationError),
    sentAt: lead.sentAt,
    lastContacted: lead.lastContacted,
    lastUpdated: lead.lastUpdated,
    followUpCreatedAt: lead.followUpCreatedAt,
    replyDetectedAt: lead.replyDetectedAt,
    dataSource: lead.dataSource,
    automationError: lead.automationError
  }));
}

function buildSummaryRows(leads) {
  return [
    metric("Alle Leads", leads.length),
    metric("Neue Leads", count(leads, (lead) => lead.automationStatus === "Neu")),
    metric("Daten ergaenzt", count(leads, (lead) => lead.automationStatus === "Daten ergänzt")),
    metric("Entwuerfe erstellt", count(leads, (lead) => lead.automationStatus === "Entwurf erstellt")),
    metric("Kontaktierte Leads", count(leads, (lead) => lead.automationStatus === "Contacted Email" || lead.pipelineStatus === "E-Mail / Contacted")),
    metric("Interessierte Leads", count(leads, (lead) => lead.pipelineStatus === "Interested")),
    metric("Pruefen oder Fehler", count(leads, (lead) => ["Prüfen", "Fehler"].includes(lead.automationStatus))),
    metric("Vollstaendige Daten", count(leads, (lead) => lead.dataQuality === "Vollständig")),
    metric("Teilweise Daten", count(leads, (lead) => lead.dataQuality === "Teilweise")),
    metric("Unvollstaendige Daten", count(leads, (lead) => lead.dataQuality === "Unvollständig")),
    metric("Leads mit E-Mail", count(leads, (lead) => Boolean(lead.contactEmail))),
    metric("Leads mit Telefonnummer", count(leads, (lead) => Boolean(lead.contactPhone))),
    metric("Erkannte Antworten", count(leads, (lead) => Boolean(lead.replyDetectedAt))),
    metric("Follow-up Entwuerfe", count(leads, (lead) => Boolean(lead.followUpDraftId))),
    metric("Geschaetzte Minuten gespart", estimateSavedMinutes(leads))
  ];
}

function buildCountRows(leads, field, keyFn) {
  const counts = new Map();

  for (const lead of leads) {
    const key = keyFn(lead);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"))
    .map(([value, amount]) => ({
      field,
      value,
      count: amount
    }));
}

function metric(name, value) {
  return { metric: name, value };
}

function compareLeads(a, b) {
  const left = `${a.company || ""} ${a.website || ""} ${a.id}`;
  const right = `${b.company || ""} ${b.website || ""} ${b.id}`;
  return left.localeCompare(right, "de");
}

function count(leads, predicate) {
  return leads.filter(predicate).length;
}

function estimateSavedMinutes(leads) {
  const draftedOrContacted = count(leads, (lead) =>
    ["Entwurf erstellt", "Contacted Email"].includes(lead.automationStatus)
    || ["E-Mail / Contacted", "Interested"].includes(lead.pipelineStatus)
  );

  return draftedOrContacted * 7;
}

async function writeCsv(filePath, rows) {
  const headers = collectHeaders(rows);
  const content = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
  ].join("\n");

  await fs.writeFile(filePath, `${content}\n`, "utf8");
}

function collectHeaders(rows) {
  const headers = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!headers.includes(key)) headers.push(key);
    }
  }
  return headers;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\r?\n/g, " ").trim();
  if (!/[",;\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}
