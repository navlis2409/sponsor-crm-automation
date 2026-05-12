import { isRegionalLead } from "./attachmentSelector.js";

const ANGLES = [
  {
    label: "Planetarium / Wissenschaft",
    keywords: ["planetarium", "sternwarte", "astronomie", "weltraum"],
    article: "Das",
    sentence:
      "Ihr Angebot verbindet Wissen und Erlebnis auf eine Weise, die für internationale Studierende gut zugänglich und zugleich besonders spannend ist."
  },
  {
    label: "Aussichtspunkt / Wahrzeichen",
    keywords: ["fernsehturm", "aussichtsturm", "aussicht", "panorama", "wahrzeichen"],
    article: "Der",
    sentence:
      "Als markantes Ausflugsziel bietet Ihr Angebot einen besonderen Blick auf die Region und wäre ein attraktiver Preis für internationale Studierende."
  },
  {
    label: "Burg / Schloss / Geschichte",
    keywords: ["burg", "schloss", "geschichte", "historisch", "mittelalter"],
    article: "Die",
    sentence:
      "Als historischer Ort passt Ihr Angebot sehr gut zu unserem Ziel, Kultur und Geschichte der Region erlebbar zu machen."
  },
  {
    label: "Museum / Bildung / Ausstellung",
    keywords: ["museum", "technorama", "science", "wissenschaft", "ausstellung", "bildung", "zeppelin"],
    article: "Das",
    sentence:
      "Ihr Bildungs- und Erlebnisangebot passt gut zu einer Veranstaltung, bei der internationale Studierende Neues entdecken und gemeinsam Erfahrungen sammeln sollen."
  },
  {
    label: "Freizeitpark / Erlebnispark",
    keywords: ["europa-park", "europapark", "freizeitpark", "erlebnispark", "theme park"],
    article: "Der",
    sentence:
      "Ihr Freizeitangebot wäre ein besonderer Preis für Studierende, die gemeinsam einen abwechslungsreichen Ausflug erleben möchten."
  },
  {
    label: "Action / Erlebnis / Arena",
    keywords: ["arena", "jochen schweizer", "klettern", "trampolin", "escape", "kart", "laser", "erlebnis"],
    article: "Die",
    sentence:
      "Ihr Erlebnisangebot passt gut zu einer studentischen Veranstaltung, bei der Teamgeist, gemeinsame Aktivitäten und neue Eindrücke im Vordergrund stehen."
  },
  {
    label: "Therme / Bad / Erholung",
    keywords: ["therme", "bad", "spa", "freizeitbad", "erholung", "sauna"],
    article: "Die",
    sentence:
      "Ihr Freizeit- und Erholungsangebot wäre ein attraktiver Preis für Studierende, die nach der Schnitzeljagd gemeinsam etwas Besonderes erleben möchten."
  },
  {
    label: "Natur / Tiere / Ausflug",
    keywords: ["affenberg", "zoo", "tierpark", "wildpark", "natur", "wald", "erlebniswald", "outdoor"],
    article: "Der",
    sentence:
      "Ihr Angebot mit Natur- und Erlebnisbezug passt sehr gut zu unserem Ziel, internationalen Studierenden besondere Orte in der Region zu zeigen."
  },
  {
    label: "Tourismus / Stadt erleben",
    keywords: ["tourist", "tourismus", "stadtführung", "city", "sehenswürdigkeiten", "tour"],
    article: "",
    sentence:
      "Ihr Angebot rund um Erlebnisse und Sehenswürdigkeiten passt gut zu unserem Ziel, internationalen Studierenden interessante Ausflugsziele näherzubringen."
  },
  {
    label: "Kultur / Veranstaltung",
    keywords: ["kino", "theater", "konzert", "kultur", "bühne", "festival"],
    article: "Das",
    sentence:
      "Ihr Kulturangebot passt gut zu unserem Ziel, internationalen Studierenden abwechslungsreiche Erlebnisse außerhalb des Campus zu ermöglichen."
  },
  {
    label: "Gastronomie / Genuss",
    keywords: ["restaurant", "cafe", "bar", "brauerei", "eisdiele", "gastronomie", "essen"],
    article: "",
    sentence:
      "Ihr gastronomisches Angebot wäre ein gut passender Preis, weil es Studierenden einen direkten Anlass gibt, gemeinsam einen Ort in der Umgebung kennenzulernen."
  },
  {
    label: "Shop / Gutschein / Sachpreis",
    keywords: ["shop", "store", "laden", "gutschein", "geschenk", "handel", "buchhandlung"],
    article: "",
    sentence:
      "Ein Gutschein oder Sachpreis aus Ihrem Angebot würde gut zu unserer Veranstaltung passen und den Gewinnerteams eine konkrete Freude machen."
  }
];

export function buildPersonalization(lead, research = {}) {
  const context = buildContext(lead, research);
  const promptPersonalization = buildPromptPersonalization(context);
  if (promptPersonalization) return promptPersonalization;

  const angle = ANGLES.find((candidate) => hasKeyword(context.normalizedText, candidate.keywords));

  if (angle) {
    return {
      paragraph: `${withArticle(context.company, angle.article)} ist uns als möglicher Partner für unsere Schnitzeljagd positiv aufgefallen. ${angle.sentence}`,
      reason: `${angle.label} anhand von Name, Kategorie, Website oder Notizen erkannt.`
    };
  }

  if (context.category && context.location) {
    return {
      paragraph:
        `${context.company} ist uns als möglicher Partner für unsere Schnitzeljagd positiv aufgefallen. ` +
        `Ihr Angebot im Bereich ${context.category} in ${context.location} passt gut zu unserem Ziel, internationalen Studierenden attraktive Orte und Aktivitäten näherzubringen.`,
      reason: `Kategorie "${context.category}" und Ort "${context.location}" aus Notion verwendet.`
    };
  }

  if (context.category) {
    return {
      paragraph:
        `${context.company} ist uns als möglicher Partner für unsere Schnitzeljagd positiv aufgefallen. ` +
        `Ihr Angebot im Bereich ${context.category} passt gut zu unserem Ziel, internationalen Studierenden attraktive Orte und Aktivitäten näherzubringen.`,
      reason: `Kategorie "${context.category}" aus Notion verwendet.`
    };
  }

  if (context.regional) {
    return {
      paragraph:
        `${context.company} ist uns als möglicher Partner für unsere Schnitzeljagd positiv aufgefallen. ` +
        "Ihr regionaler Bezug passt gut zu unserem Ziel, internationalen Studierenden Konstanz und die Bodenseeregion näherzubringen.",
      reason: "Regionaler Bezug anhand von Ort, Website, Name oder Notizen erkannt."
    };
  }

  return {
    paragraph:
      `${context.company} ist uns als möglicher Partner für unsere Schnitzeljagd positiv aufgefallen. ` +
      "Ihr Angebot passt gut zu einer studentischen Veranstaltung mit internationalem Publikum und wäre ein attraktiver Preis für die Gewinnerteams.",
    reason: "Keine eindeutige Kategorie erkannt; neutrale professionelle Begründung genutzt."
  };
}

function buildPromptPersonalization(context) {
  const sentence = buildPromptSentence(context.emailPrompt);
  if (!sentence) return null;

  return {
    paragraph:
      `${context.company} ist uns als mÃ¶glicher Partner fÃ¼r unsere Schnitzeljagd positiv aufgefallen. ` +
      sentence,
    reason: `E-Mail Prompt aus Notion verwendet: "${shortenForReason(context.emailPrompt)}"`
  };
}

function buildPromptSentence(prompt) {
  let text = cleanPrompt(prompt);
  if (!text || isStyleOnlyPrompt(text)) return null;

  const dassMatch = text.match(/\bdass\s+(.+)/i);
  if (dassMatch?.[1]) {
    const content = cleanPrompt(dassMatch[1]);
    if (!content) return null;
    return ensureSentence(`FÃ¼r unsere Anfrage ist besonders relevant, dass ${lowerLeadingArticle(content)}`);
  }

  text = text
    .replace(/^(bitte\s+)?(betone|betonen|erwÃ¤hne|erwaehne|nenn|nenne|hervorheben|hebe)\s*(bitte\s+)?[:,]?\s*/i, "")
    .replace(/^(sprich|spreche)\s+(bitte\s+)?/i, "")
    .replace(/\s+an$/i, "");

  text = cleanPrompt(text);
  if (!text || isStyleOnlyPrompt(text)) return null;

  if (looksLikeCompleteSentence(text)) return ensureSentence(text);

  return ensureSentence(`Besonders passend finden wir ${lowerLeadingArticle(text)}`);
}

function buildContext(lead, research) {
  const company = cleanValue(lead.company || research.company) || "Ihre Organisation";
  const category = cleanValue(lead.category);
  const location = cleanValue(lead.location);
  const emailPrompt = cleanValue(lead.emailPrompt);
  const text = [
    lead.company,
    research.company,
    lead.category,
    lead.location,
    lead.emailPrompt,
    lead.desiredPrize,
    lead.notes,
    lead.website,
    ...(research.sources || [])
  ]
    .filter(Boolean)
    .join(" ");

  return {
    company,
    category,
    location,
    emailPrompt,
    regional: isRegionalLead({ ...lead, company }),
    normalizedText: normalize(text)
  };
}

function withArticle(company, article) {
  if (!company || company === "Ihre Organisation") return "Ihre Organisation";
  if (!article) return company;

  const lower = company.toLowerCase();
  if (lower.startsWith("der ") || lower.startsWith("die ") || lower.startsWith("das ")) {
    return company;
  }

  if (lower.includes("schloss")) return `Das ${company}`;
  if (lower.includes("museum") || lower.includes("technorama") || lower.includes("planetarium")) return `Das ${company}`;
  if (lower.includes("therme") || lower.includes("arena") || lower.includes("burg")) return `Die ${company}`;
  if (lower.includes("fernsehturm") || lower.includes("park") || lower.includes("affenberg")) return `Der ${company}`;

  return `${article} ${company}`;
}

function hasKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(normalize(keyword)));
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss");
}

function cleanValue(value) {
  return String(value || "").trim();
}

function cleanPrompt(value) {
  return cleanValue(value)
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[;:,\s]+$/g, "")
    .slice(0, 260);
}

function looksLikeCompleteSentence(value) {
  return /[.!?]$/.test(value) || /^(Der|Die|Das|Ihr|Ihre|Unser|Unsere|Als|Durch|Gerade)\b/.test(value);
}

function ensureSentence(value) {
  const text = cleanValue(value);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function lowerLeadingArticle(value) {
  return cleanValue(value).replace(/^(Der|Die|Das|Den|Dem|Ihr|Ihre|Ihrem|Ihren)\b/, (match) => match.toLowerCase());
}

function isStyleOnlyPrompt(value) {
  const text = normalize(value);
  const styleWords = ["sachlich", "professionell", "kurz", "freundlich", "locker", "nicht zu", "formuliere"];
  const contentWords = [
    "eintritt",
    "gutschein",
    "preis",
    "regional",
    "bodensee",
    "konstanz",
    "student",
    "museum",
    "kultur",
    "erlebnis",
    "ausflug",
    "produkt",
    "genuss",
    "ticket",
    "veranstaltung"
  ];

  return styleWords.some((word) => text.includes(word)) && !contentWords.some((word) => text.includes(word));
}

function shortenForReason(value) {
  const text = cleanPrompt(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}
