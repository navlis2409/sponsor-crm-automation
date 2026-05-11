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
  "friedrichshafen",
  "meersburg",
  "reichenau",
  "radolfzell",
  "singen",
  "ravensburg",
  "lindau",
  "allensbach",
  "ueberlingen",
  "überlingen",
  "kreuzlingen"
];

export function selectAttachment(lead) {
  const haystack = [
    lead.location,
    lead.website,
    lead.company,
    lead.notes
  ].filter(Boolean).join(" ").toLowerCase();

  const filename = REGIONAL_KEYWORDS.some((keyword) => haystack.includes(keyword))
    ? REGIONAL_ATTACHMENT
    : NATIONAL_ATTACHMENT;

  return path.join(PROJECT_ROOT, "attachments", filename);
}

export function describeAttachment(attachmentPath) {
  return path.relative(PROJECT_ROOT, attachmentPath).replace(/\\/g, "/");
}
