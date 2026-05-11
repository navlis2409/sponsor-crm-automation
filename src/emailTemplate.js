import { buildPersonalization } from "./personalization.js";

export function buildEmailBody(lead, research) {
  const personalization = buildPersonalization(lead, research);

  return {
    personalizationReason: personalization.reason,
    body: [
      "Sehr geehrte Damen und Herren,",
      "",
      "mein Name ist Silvan Dorner und ich bin Student an der HTWG Konstanz. Gemeinsam mit unserem Team organisieren wir eine Schnitzeljagd für internationale Austauschstudierende.",
      "",
      "Für diese Veranstaltung suchen wir passende Preise, mit denen die Teilnehmenden Konstanz, die Bodenseeregion und interessante Ausflugsziele auf spielerische Weise kennenlernen können.",
      "",
      personalization.paragraph,
      "",
      "Deshalb möchten wir freundlich anfragen, ob Sie sich vorstellen könnten, unsere Veranstaltung mit passenden Preisen, zum Beispiel Eintrittskarten oder Gutscheinen, zu unterstützen.",
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
