export function buildEmailBody(lead, research) {
  const company = lead.company || "Ihre Organisation";
  const personalization = buildPersonalization(lead, research);

  return {
    personalizationReason: personalization.reason,
    body: [
      "Sehr geehrte Damen und Herren,",
      "",
      "mein Name ist Silvan Dorner und ich bin Student an der HTWG Konstanz. Gemeinsam mit unserem Team organisieren wir eine Schnitzeljagd für internationale Austauschstudierende.",
      "",
      `Da ${company} ${personalization.sentence}, möchten wir freundlich anfragen, ob Sie sich vorstellen könnten, unsere Veranstaltung in Form von Preisen zu unterstützen.`,
      "",
      "Die Schnitzeljagd soll internationalen Studierenden helfen, Konstanz und die Region auf spielerische Weise kennenzulernen. Besonders freuen würden wir uns über Eintrittskarten, Gutscheine oder kleine Preise für die Gewinnerteams.",
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

function buildPersonalization(lead) {
  const category = lead.category?.trim();
  const location = lead.location?.trim();
  const notes = lead.notes?.trim();

  if (category && location) {
    return {
      sentence: `mit Ihrem Angebot im Bereich ${category} in ${location} gut zu unserem Ziel passt, internationalen Studierenden Konstanz und die Region näherzubringen`,
      reason: `Kategorie "${category}" und Ort "${location}" wurden aus Notion verwendet.`
    };
  }

  if (category) {
    return {
      sentence: `mit Ihrem Angebot im Bereich ${category} gut zu unserem Ziel passt, internationalen Studierenden Konstanz und die Region näherzubringen`,
      reason: `Kategorie "${category}" wurde aus Notion verwendet.`
    };
  }

  if (notes) {
    return {
      sentence: "Ihr Angebot gut zu unserem Ziel passt, internationalen Studierenden Konstanz und die Region näherzubringen",
      reason: "Notizen waren vorhanden, aber keine klare sichere Sponsor-Begruendung; Standardbegruendung genutzt."
    };
  }

  return {
      sentence: "Ihr Angebot gut zu unserem Ziel passt, internationalen Studierenden Konstanz und die Region näherzubringen",
    reason: "Keine klare Begruendung gefunden; Standardbegruendung genutzt."
  };
}
