import { buildPersonalization } from "./personalization.js";

export function buildEmailBody(lead, research) {
  const personalization = buildPersonalization(lead, research);
  const supportRequest = buildSupportRequest(lead);

  return {
    personalizationReason: personalization.reason,
    body: [
      "Sehr geehrte Damen und Herren,",
      "",
      "mein Name ist Silvan Dorner und ich bin Student an der HTWG Konstanz. Gemeinsam mit unserem Team organisieren wir eine Schnitzeljagd für internationale Austauschstudierende.",
      "",
      "Mit der Veranstaltung möchten wir internationalen Studierenden Konstanz, die Bodenseeregion und interessante Ausflugsziele näherbringen.",
      "",
      personalization.paragraph,
      "",
      supportRequest,
      "",
      "Weitere Informationen zu unserem Projekt finden Sie im beigefügten Infoblatt.",
      "",
      "Wir würden uns sehr über eine Rückmeldung freuen und stehen Ihnen bei Fragen jederzeit gerne zur Verfügung.",
      "",
      "Mit freundlichen Grüßen",
      "",
      "Silvan Dorner",
      "HTWG Scavengerhunt Team",
      "",
      "E-Mail: htwgscavengerhunt@gmail.com",
      "Telefon: +49 163 7128969",
      "",
      "Silvan Dorner / David Zibal",
      "Ralf-Dahrendorf-Straße 37, R242",
      "78464 Konstanz"
    ].join("\n")
  };
}

function buildSupportRequest(lead) {
  const desiredPrize = cleanDesiredPrize(lead.desiredPrize);
  if (!desiredPrize) {
    return "Deshalb möchten wir freundlich anfragen, ob Sie sich vorstellen könnten, unsere Veranstaltung durch Eintrittskarten oder Gutscheine zu unterstützen.";
  }

  return `Deshalb möchten wir freundlich anfragen, ob Sie sich vorstellen könnten, unsere Veranstaltung durch ${desiredPrize} zu unterstützen.`;
}

function cleanDesiredPrize(value) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[.!?,;:\s]+$/g, "")
    .trim()
    .slice(0, 120);

  if (!text) return "";

  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss");

  if (["preise", "passende preise", "kleine preise", "sachleistungen"].includes(normalized)) return "";
  if (normalized.includes("eintritt") && normalized.includes("gutschein")) {
    return "Eintrittskarten oder Gutscheine";
  }
  if (normalized.includes("eintritt") || normalized.includes("ticket")) return "Eintrittskarten";
  if (normalized.includes("gutschein")) return "Gutscheine";
  if (normalized.includes("sachpreis")) return "Sachpreise";
  if (normalized.includes("produkt")) return "Produktpakete";
  if (normalized.includes("rabatt")) return "Rabattcodes";

  return text;
}
