import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const REGIONAL_ATTACHMENT = "Infoblatt HTWG Scavengerhunt.pdf";
const NATIONAL_ATTACHMENT = "Infoblatt HTWG.Scavengerhunt.pdf";

const REGIONAL_KEYWORDS = [
  "konstanz",
  "bodensee",
  "bodenseeregion",
  "bodenseekreis",
  "friedrichshafen",
  "meersburg",
  "reichenau",
  "radolfzell",
  "singen",
  "ravensburg",
  "lindau",
  "allensbach",
  "überlingen",
  "ueberlingen",
  "uhldingen",
  "immenstaad",
  "hagnau",
  "markdorf",
  "tettnang",
  "salem",
  "birnau",
  "kreuzlingen",
  "stein am rhein",
  "schaffhausen"
];

export function selectAttachment(lead) {
  const filename = isRegionalLead(lead)
    ? REGIONAL_ATTACHMENT
    : NATIONAL_ATTACHMENT;

  return path.join(PROJECT_ROOT, "attachments", filename);
}

export function isRegionalLead(lead) {
  const haystack = [
    lead.location,
    lead.website,
    lead.company,
    lead.notes
  ].filter(Boolean).join(" ").toLowerCase();

  return REGIONAL_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

export function describeAttachment(attachmentPath) {
  return path.relative(PROJECT_ROOT, attachmentPath).replace(/\\/g, "/");
}
