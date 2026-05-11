import { load } from "cheerio";

const BUSINESS_EMAIL_PREFIXES = [
  "info",
  "kontakt",
  "contact",
  "marketing",
  "sponsoring",
  "sponsor",
  "kooperation",
  "kooperationen",
  "presse",
  "press",
  "office",
  "hello"
];

const PRIVATE_PREFIXES = [
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
  "postmaster"
];

const CONTACT_PATHS = [
  "",
  "/kontakt",
  "/contact",
  "/impressum",
  "/presse",
  "/press",
  "/marketing",
  "/sponsoring",
  "/kooperationen"
];

export async function researchBusinessContact(lead) {
  const website = normalizeWebsite(lead.website);

  if (!website) {
    return {
      email: null,
      phone: null,
      person: null,
      sources: [],
      reason: "Keine Website im Notion-Eintrag vorhanden."
    };
  }

  const pages = await fetchCandidatePages(website);
  const emailCandidates = [];
  const phoneCandidates = [];
  const personCandidates = [];

  for (const page of pages) {
    const text = htmlToText(page.html);
    emailCandidates.push(...extractBusinessEmails(page.html, page.url));
    phoneCandidates.push(...extractPhones(text, page.url));
    personCandidates.push(...extractContactPersons(text, page.url));
  }

  const email = chooseEmail(emailCandidates);

  if (!email) {
    return {
      email: null,
      phone: choosePhone(phoneCandidates),
      person: choosePerson(personCandidates),
      sources: unique(pages.map((page) => page.url)),
      reason: "Keine sichere allgemeine geschaeftliche E-Mail-Adresse auf offiziellen Seiten gefunden."
    };
  }

  return {
    email: email.value,
    phone: choosePhone(phoneCandidates),
    person: choosePerson(personCandidates),
    sources: unique([email.source, ...pages.map((page) => page.url)]),
    reason: "Sichere allgemeine geschaeftliche E-Mail-Adresse auf offizieller Website gefunden."
  };
}

async function fetchCandidatePages(website) {
  const baseUrl = new URL(website);
  const pages = [];

  for (const candidatePath of CONTACT_PATHS) {
    const url = new URL(candidatePath, baseUrl).toString();

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

      if (pages.length >= 5) break;
    } catch (error) {
      console.warn(`Kontaktrecherche: Seite konnte nicht gelesen werden (${safeUrl(url)}): ${error.message}`);
    }
  }

  return pages;
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

function htmlToText(html) {
  const $ = load(html);
  $("script, style, noscript").remove();
  return $.text().replace(/\s+/g, " ").trim();
}

function extractBusinessEmails(html, source) {
  const normalized = html
    .replace(/&#64;|\[at\]|\(at\)| at /gi, "@")
    .replace(/\[dot\]|\(dot\)| dot /gi, ".");

  const matches = normalized.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];

  return unique(matches.map((email) => email.toLowerCase()))
    .filter(isBusinessEmail)
    .map((email) => ({ value: email, source }));
}

function extractPhones(text, source) {
  const matches = text.match(/(?:\+49|0049|0)[\d\s()./-]{6,}\d/g) || [];
  return unique(matches.map((phone) => phone.replace(/\s+/g, " ").trim()))
    .slice(0, 3)
    .map((phone) => ({ value: phone, source }));
}

function extractContactPersons(text, source) {
  const patterns = [
    /(?:Ansprechpartner|Kontaktperson|Pressekontakt|Marketingkontakt)[:\s]+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.'-]+(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.'-]+){1,3})/g,
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

function chooseEmail(candidates) {
  if (candidates.length === 0) return null;

  return [...candidates].sort((a, b) => emailScore(b.value) - emailScore(a.value))[0];
}

function choosePhone(candidates) {
  return candidates[0]?.value || null;
}

function choosePerson(candidates) {
  return candidates[0]?.value || null;
}

function isBusinessEmail(email) {
  const [localPart] = email.split("@");

  if (!localPart || PRIVATE_PREFIXES.some((prefix) => localPart.startsWith(prefix))) {
    return false;
  }

  if (BUSINESS_EMAIL_PREFIXES.some((prefix) => localPart === prefix || localPart.startsWith(`${prefix}.`) || localPart.startsWith(`${prefix}-`))) {
    return true;
  }

  return false;
}

function emailScore(email) {
  const [localPart] = email.split("@");
  const index = BUSINESS_EMAIL_PREFIXES.findIndex((prefix) => localPart.startsWith(prefix));
  return index === -1 ? 0 : BUSINESS_EMAIL_PREFIXES.length - index;
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
