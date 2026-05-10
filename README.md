# Sponsor CRM Automation

Automatisierung für die Notion-Datenbank **Sponsor Scavenger Hunt CRM** und Gmail. Das Script prüft regelmäßig neue Sponsoring-Leads, recherchiert öffentlich angegebene geschäftliche Kontaktinformationen und erstellt ausschließlich Gmail-Entwürfe.

Wichtig: Dieses Projekt sendet niemals automatisch E-Mails. Es verwendet nur `gmail.users.drafts.create`. Der finale Versand erfolgt immer manuell durch Silvan Dorner nach Pruefung im Gmail-Account.

## Funktionen

- Liest Notion-Eintraege mit Status `Neu`.
- Recherchiert Kontaktinformationen nur auf offiziellen oder eindeutig geschaeftlichen Quellen wie Website, Kontaktseite, Impressum, Presse, Marketing, Sponsoring oder Kooperationen.
- Verwendet bevorzugt allgemeine geschaeftliche Adressen wie `info@`, `kontakt@`, `marketing@`, `sponsoring@`, `kooperation@` oder `presse@`.
- Erstellt keinen Entwurf, wenn keine sichere geschaeftliche E-Mail-Adresse gefunden wurde.
- Aktualisiert Notion nach der Entwurfserstellung mit Kontaktadresse, Quelle, Anhang, Draft-ID und Hinweis auf den manuellen Versand.
- Prueft Eintraege mit Status `Entwurf erstellt` und erkennt, ob ein zuvor erstellter Entwurf spaeter manuell gesendet wurde.

## Setup

### 1. Abhaengigkeiten installieren

```bash
npm install
```

### 2. Notion API einrichten

1. In Notion eine Integration erstellen: <https://www.notion.so/my-integrations>
2. Den internen Integration Token als `NOTION_API_KEY` speichern.
3. Die Datenbank **Sponsor Scavenger Hunt CRM** mit der Integration teilen.
4. Die Datenbank-ID aus der Notion-URL kopieren und als `NOTION_DATABASE_ID` speichern.
5. Sicherstellen, dass diese Eigenschaften exakt existieren:
   - `Sponsor / Unternehmen`
   - `Website`
   - `Ort`
   - `Kategorie`
   - `Reichweite`
   - `Kontakt E-Mail`
   - `Kontakt Telefon`
   - `Ansprechpartner`
   - `Status`
   - `Gmail Draft Link`
   - `Gmail Draft ID`
   - `Gesendet am`
   - `Notizen`

Die Statuswerte sollten mindestens `Neu`, `Prüfen`, `Entwurf erstellt` und `Contacted Email` enthalten.

### 3. Gmail API einrichten

1. In der Google Cloud Console ein Projekt erstellen.
2. Gmail API aktivieren.
3. OAuth Consent Screen konfigurieren.
4. OAuth Client ID für eine Desktop App oder Web App erstellen.
5. `GMAIL_CLIENT_ID` und `GMAIL_CLIENT_SECRET` speichern.
6. Einen Refresh Token für den Gmail-Account `htwgscavengerhunt@gmail.com` erzeugen.
7. Der OAuth Scope sollte Entwuerfe erstellen und Mails lesen koennen, zum Beispiel:

```text
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/gmail.readonly
```

Dieses Projekt nutzt keine Gmail-Send-Funktion.

### 4. Umgebungsvariablen

Lokal kann eine `.env` Datei auf Basis von `.env.example` erstellt werden:

```bash
cp .env.example .env
```

Benötigte Werte:

```text
NOTION_API_KEY=
NOTION_DATABASE_ID=
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_SENDER_EMAIL=htwgscavengerhunt@gmail.com
```

In GitHub muessen dieselben Werte unter **Settings > Secrets and variables > Actions > Repository secrets** gespeichert werden.

### 5. Attachments

Lege die beiden PDFs exakt mit diesen Dateinamen im Ordner `attachments/` ab:

```text
attachments/Infoblatt HTWG Scavengerhunt.pdf
attachments/Infoblatt HTWG.Scavengerhunt.pdf
```

Regionale Leads erhalten `Infoblatt HTWG Scavengerhunt.pdf`. Ueberregionale oder nicht eindeutig lokale Leads erhalten `Infoblatt HTWG.Scavengerhunt.pdf`.

### 6. GitHub Actions

Der Workflow liegt unter `.github/workflows/run.yml`.

Er laeuft alle 30 Minuten und kann zusaetzlich manuell gestartet werden:

1. Repository auf GitHub oeffnen.
2. Tab **Actions** oeffnen.
3. Workflow **Run sponsor CRM automation** auswaehlen.
4. **Run workflow** starten.

Der Workflow fuehrt `npm install` und danach `npm start` aus.

## Sicherheit

- Die Automatisierung verwendet ausschliesslich `gmail.users.drafts.create`.
- Es gibt keinen Codepfad für automatisches Senden.
- Wenn die Recherche unsicher ist, wird der Notion-Status auf `Prüfen` gesetzt.
- Wenn keine sichere geschaeftliche E-Mail-Adresse gefunden wird, wird kein Gmail-Entwurf erstellt.
- Private E-Mail-Adressen oder private Telefonnummern werden nicht genutzt.
- Secrets werden nur ueber Umgebungsvariablen gelesen und nicht geloggt.

## Troubleshooting

### Notion findet keine Leads

- Prüfen, ob die Datenbank mit der Integration geteilt wurde.
- Prüfen, ob `NOTION_DATABASE_ID` korrekt ist.
- Prüfen, ob der Statuswert exakt `Neu` heisst.

### Status kann nicht gesetzt werden

- Prüfen, ob die Statusoptionen in Notion existieren.
- Falls Notion abweichende Statusnamen verwendet, den Statuswert in `src/notion.js` bei Bedarf exakt anpassen.

### Gmail-Entwurf wird nicht erstellt

- Prüfen, ob die Gmail API aktiviert ist.
- Prüfen, ob der Refresh Token zum Absenderkonto gehört.
- Prüfen, ob beide PDFs im Ordner `attachments/` mit exakt korrektem Namen liegen.

### Lead wird auf `Prüfen` gesetzt

Das passiert, wenn keine sichere allgemeine geschaeftliche E-Mail-Adresse auf offiziellen Seiten gefunden wurde. In `Notizen` werden die geprueften Quellen und der Grund protokolliert.

### Manueller Versand wird nicht erkannt

Die Erkennung ist bewusst konservativ. Sie aktualisiert Notion nur, wenn der Draft nicht mehr existiert und eine passende Nachricht im Ordner `Gesendet` mit gleicher Empfaengeradresse und gleichem Betreff gefunden wurde.
