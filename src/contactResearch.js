import { load } from "cheerio";
import { DATA_QUALITY } from "./notion.js";

const EMAIL_PRIORITY = [
  "sponsoring",
  "sponsor",
  "kooperation",
  "kooperationen",
  "marketing",
  "presse",
  "press",
  "sales",
  "vertrieb",
  "info",
  "kontakt",
  "contact",
  "office",
  "hello"
];

const BLOCKED_PREFIXES = [
  "bewerbung",
  "jobs",
  "karriere",
  "career",
  "hr",
  "datenschutz",
  "privacy",
  "abuse",
  "admin",
  "webmaster",
  "postmaster",
  "no-reply",
  "noreply"
];

const CONTACT_PATHS = [
  "",
  "/kontakt",
  "/contact",
  "/impressum",
  "/about",
  "/ueber-uns",
  "/über-uns",
  "/presse",
  "/press",
  "/marketing",
  "/sponsoring",
  "/kooperationen"
];

export async function researchBusinessContact(lead) {
  const website = normalizeWebsite(lead.website);

  if (!website) {
    return emptyResult("Keine Website im Notion-Eintrag vorhanden.");
  }

  const pages = await fetchCandidatePages(website);
  if (pages.length === 0) {
    return emptyResult("Keine öffentlich lesbaren Website-Seiten gefunden.", website);
  }

  const emailCandidates = [];
  const phoneCandidates = [];
  const personCandidates = [];
  const linkedInCandidates = [];
  const companyCandidates = [];

  for (const page of pages) {
    const $ = load(page.html);
    const text = htmlToText($);

    emailCandidates.push(...extractEmails(text, page.url));
    phoneCandidates.push(...extractPhones(text, page.url, website));
    personCandidates.push(...extractContactPersons(text, page.url));
    linkedInCandidates.push(...extractLinkedInLinks($, page.url));
    companyCandidates.push(...extractCompanyNames($, text, page.url));
  }

  const email = chooseEmail(emailCandidates);
  const company = chooseCompany(companyCandidates, website);
  const phone = choosePhone(phoneCandidates);
  const person = choosePerson(personCandidates);
  const linkedin = chooseLinkedIn(linkedInCandidates);
  const sources = unique([
    email?.source,
    phone?.source,
    person?.source,
    linkedin?.source,
    company?.source,
    ...pages.map((page) => page.url)
  ]);

  const dataQuality = determineDataQuality({ email, company, phone, linkedin });
  const reason = email
    ? "Sichere geschäftliche Kontaktadresse auf öffentlich zugänglichen Website-Seiten gefunden."
    : "Keine sichere geschäftliche E-Mail-Adresse auf öffentlich zugänglichen Website-Seiten gefunden.";

  return {
    company: company?.value || null,
    email: email?.value || null,
    phone: phone?.value || null,
    person: person?.value || null,
    linkedin: linkedin?.value || null,
    sources,
    dataQuality,
    reason
  };
}

async function fetchCandidatePages(website) {
  const baseUrl = new URL(website);
  const pages = [];
  const seen = new Set();

  for (const candidatePath of CONTACT_PATHS) {
    const url = new URL(candidatePath, baseUrl).toString();
    if (seen.has(url)) continue;
    seen.add(url);

    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "user-agent": "HTWG Scavengerhunt Sponsoring Contact Research"
        },
        signal: AbortSignal.timeout(10000)
      });

      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("text/html")) continue;

      const html = await response.text();
      pages.push({ url: response.url || url, html });

      if (pages.length >= 6) break;
    } catch (error) {
      console.warn(`Kontaktrecherche: Seite konnte nicht gelesen werden (${safeUrl(url)}): ${error.message}`);
    }
  }

  return pages;
}

function extractEmails(text, source) {
  const normalized = text
    .replace(/&#64;|\[at\]|\(at\)| at /gi, "@")
    .replace(/\[dot\]|\(dot\)| dot /gi, ".");

  const matches = normalized.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];

  return unique(matches.map((email) => email.toLowerCase()))
    .filter(isUsableBusinessEmail)
    .map((email) => ({
      value: email,
      source,
      score: emailScore(email, normalized)
    }));
}

function extractPhones(text, source, website) {
  const countryCode = inferCountryCode(website);
  const matches = text.match(/(?:\+\d{1,3}|00\d{1,3}|0)[\d\s()./-]{6,}\d/g) || [];

  return unique(matches.map((phone) => normalizePhone(phone, countryCode)))
    .filter(Boolean)
    .slice(0, 3)
    .map((phone) => ({ value: phone, source }));
}

function extractContactPersons(text, source) {
  const patterns = [
    /(?:Ansprechpartner|Kontaktperson|Pressekontakt|Marketingkontakt|Sponsoring|Kooperationen?)[:\s]+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.'-]+(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.'-]+){1,3})/g,
    /([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.'-]+(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.'-]+){1,3})\s+(?:Presse|Marketing|Sponsoring|Kooperation)/g
  ];

  const people = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      people.push({ value: match[1].trim(), source });
    }
  }

  return people;
}

function extractLinkedInLinks($, source) {
  const links = [];
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href || !href.includes("linkedin.com/company")) return;
    links.push({ value: href.split("?")[0], source });
  });
  return links;
}

function extractCompanyNames($, text, source) {
  const candidates = [];

  for (const json of extractJsonLd($)) {
    const name = json?.name || json?.legalName || json?.publisher?.name || json?.organization?.name;
    if (name) candidates.push({ value: cleanCompanyName(name), source, score: 100 });
  }

  const ogSiteName = $("meta[property='og:site_name']").attr("content");
  if (ogSiteName) candidates.push({ value: cleanCompanyName(ogSiteName), source, score: 80 });

  const title = $("title").first().text();
  if (title) candidates.push({ value: cleanCompanyName(title), source, score: 60 });

  const h1 = $("h1").first().text();
  if (h1) candidates.push({ value: cleanCompanyName(h1), source, score: 50 });

  const impressumMatch = text.match(/(?:Angaben gemäß § 5 TMG|Impressum|Anbieterkennzeichnung)\s+(.{5,120})/i);
  if (impressumMatch) candidates.push({ value: cleanCompanyName(impressumMatch[1]), source, score: 70 });

  return candidates.filter((candidate) => candidate.value && candidate.value.length <= 80);
}

function extractJsonLd($) {
  const values = [];
  $("script[type='application/ld+json']").each((_, element) => {
    try {
      const parsed = JSON.parse($(element).contents().text());
      if (Array.isArray(parsed)) values.push(...parsed);
      else if (parsed?.["@graph"]) values.push(...parsed["@graph"]);
      else values.push(parsed);
    } catch {
      // Ignore invalid structured data.
    }
  });
  return values;
}

function chooseEmail(candidates) {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.score - a.score)[0];
}

function choosePhone(candidates) {
  return candidates[0] || null;
}

function choosePerson(candidates) {
  return candidates[0] || null;
}

function chooseLinkedIn(candidates) {
  return candidates[0] || null;
}

function chooseCompany(candidates, website) {
  const host = new URL(website).hostname.replace(/^www\./, "");
  return [...candidates]
    .filter((candidate) => candidate.value && !candidate.value.toLowerCase().includes("impressum"))
    .sort((a, b) => b.score - a.score)[0] || { value: host.split(".")[0], source: website };
}

function isUsableBusinessEmail(email) {
  const [localPart] = email.split("@");
  if (!localPart) return false;
  return !BLOCKED_PREFIXES.some((prefix) => localPart.startsWith(prefix));
}

function emailScore(email, pageText) {
  const [localPart] = email.split("@");
  const priorityIndex = EMAIL_PRIORITY.findIndex((prefix) => localPart === prefix || localPart.startsWith(`${prefix}.`) || localPart.startsWith(`${prefix}-`));
  const priorityScore = priorityIndex === -1 ? 20 : 200 - priorityIndex * 10;
  const officialPersonalScore = isOfficialPersonalEmail(localPart, email, pageText) ? 220 : 0;
  return Math.max(priorityScore, officialPersonalScore);
}

function isOfficialPersonalEmail(localPart, email, pageText) {
  if (!localPart.includes(".") && !localPart.includes("-")) return false;
  const index = pageText.toLowerCase().indexOf(email.toLowerCase());
  if (index === -1) return false;
  const context = pageText.slice(Math.max(0, index - 120), index + 120).toLowerCase();
  return ["presse", "marketing", "sponsoring", "kooperation", "kontakt", "ansprechpartner"].some((word) => context.includes(word));
}

function determineDataQuality({ email, company, phone, linkedin }) {
  if (email && company) return DATA_QUALITY.COMPLETE;
  if (company || phone || linkedin) return DATA_QUALITY.PARTIAL;
  return DATA_QUALITY.INCOMPLETE;
}

function normalizeWebsite(value) {
  if (!value) return null;

  try {
    return new URL(value).toString();
  } catch {
    try {
      return new URL(`https://${value}`).toString();
    } catch {
      return null;
    }
  }
}

function htmlToText($) {
  $("script, style, noscript").remove();
  return $.text().replace(/\s+/g, " ").trim();
}

function normalizePhone(value, countryCode) {
  let cleaned = value.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("00")) cleaned = `+${cleaned.slice(2)}`;
  if (cleaned.startsWith("0")) cleaned = `${countryCode}${cleaned.slice(1)}`;
  if (!cleaned.startsWith("+")) return null;
  return cleaned;
}

function inferCountryCode(website) {
  try {
    const host = new URL(website).hostname.toLowerCase();
    if (host.endsWith(".ch")) return "+41";
    if (host.endsWith(".at")) return "+43";
  } catch {
    // Fall through to Germany.
  }
  return "+49";
}

function cleanCompanyName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s[-|].*$/, "")
    .trim();
}

function emptyResult(reason, source) {
  return {
    company: null,
    email: null,
    phone: null,
    person: null,
    linkedin: null,
    sources: source ? [source] : [],
    dataQuality: DATA_QUALITY.INCOMPLETE,
    reason
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "ungueltige URL";
  }
}
