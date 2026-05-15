# Sponsor CRM Automation

Automatisierung für die Notion-Datenbank **Sponsor Scavenger Hunt CRM** und Gmail. Das Script ergänzt Leads aus öffentlich verfügbaren Website-Daten, erstellt ausschließlich Gmail-Entwürfe und erkennt später, ob ein Entwurf manuell versendet wurde.

Wichtig: Dieses Projekt sendet niemals automatisch E-Mails. Der finale Versand erfolgt immer manuell durch Silvan Dorner nach Prüfung im Gmail-Account.

## Funktionen

- Liest Leads mit `Automation Status = Neu`.
- Recherchiert öffentlich verfügbare Unternehmensdaten auf Website, Kontaktseite, Impressum, About-/Über-uns-Seiten, Presse, Marketing, Sponsoring und Kooperationen.
- Ergänzt Firmenname, E-Mail, Telefon, Ansprechpartner, LinkedIn, Datenquelle, Datenqualität und letzte Aktualisierung in Notion.
- Überschreibt manuell gepflegte Felder nicht automatisch.
- Erstellt nur dann einen Gmail-Entwurf, wenn eine sichere geschäftliche E-Mail-Adresse gefunden wurde.
- Berücksichtigt optional pro Lead `E-Mail Prompt` und `Gewünschter Preis`, um Entwürfe gezielter zu formulieren.
- Unterscheidet regionale und überregionale Leads für den passenden Anhang.
- Erkennt nach manuellem Versand eines Gmail-Entwurfs die gesendete Mail und verschiebt den Lead in der Pipeline auf `E-Mail / Contacted`.
- Erstellt nach 7 Tagen ohne erkannte Antwort einen Follow-up-Entwurf.
- Erkennt Antworten vorsichtig und verschiebt den Lead auf `Interested`.
- Prüft mögliche Duplikate anhand von Website oder E-Mail.
- Läuft über GitHub Actions alle 10 Minuten.
- Exportiert Dashboard-Daten für PowerBI als CSV-Dateien im Ordner `dashboard/`.

## Notion-Felder

Vorhandene oder empfohlene Felder:

```text
Name
Website
Location
Industry
Lead Score
Email
Phone
Ansprechpartner
Status
Automation Status
Gmail Draft Link
Gmail Draft ID
Gmail Draft Message ID
Gmail Thread ID
Gmail Sent Message ID
Gesendet am
Last Contacted
LinkedIn
Datenquelle
Datenqualität
Letzte Aktualisierung
Automation Error
Follow-up Draft ID
Follow-up erstellt am
Antwort erkannt am
E-Mail Prompt
Gewünschter Preis
Notizen
```

`Status` ist der sichtbare Pipeline-Status mit Optionen wie:

```text
Lead
Called / Contacted
E-Mail / Contacted
Interested
Closed-Won
Closed-Lost
```

`Automation Status` steuert die Technik:

```text
Neu
Daten ergänzt
Prüfen
Entwurf erstellt
Contacted Email
Fehler
```

`Datenqualität`:

```text
Vollständig
Teilweise
Unvollständig
```

Optionale Felder für bessere E-Mail-Entwürfe:

```text
E-Mail Prompt = Text
Gewünschter Preis = Text
```

`E-Mail Prompt` ist ein kurzer Hinweis pro Lead. Er wird kontrolliert in den individuellen Absatz eingebaut, aber nicht blind als fertiger Mailtext kopiert.

Gute Beispiele:

```text
Betone, dass Eintrittskarten als Preise besonders passend wären.
Sprich den regionalen Bezug zur Bodenseeregion an.
Betone das Museum als spannendes Bildungs- und Erlebnisangebot.
```

`Gewünschter Preis` steuert den konkreten Anfrage-Satz. Gute Beispiele:

```text
Eintrittskarten
Gutscheinen
Eintrittskarten oder Gutscheinen
Produktpaketen
Rabattcodes
```

## Setup

### 1. Abhängigkeiten installieren

```bash
npm install
```

### 2. Notion API einrichten

1. In Notion eine Integration erstellen: <https://www.notion.so/my-integrations>
2. Den internen Integration Token als `NOTION_API_KEY` speichern.
3. Die Datenbank **Sponsor Scavenger Hunt CRM** mit der Integration teilen.
4. Die Datenbank-ID als `NOTION_DATABASE_ID` speichern.
5. Die oben genannten Felder in Notion anlegen.

### 3. Gmail API einrichten

Die Gmail API benötigt weiterhin:

```text
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/gmail.readonly
```

Das Script nutzt `drafts.create`, aber keine Send-Funktion.

### 4. GitHub Secrets

In GitHub unter **Settings > Secrets and variables > Actions > Repository secrets**:

```text
NOTION_API_KEY
NOTION_DATABASE_ID
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN
GMAIL_SENDER_EMAIL
```

### 5. Attachments

Diese beiden Dateien müssen exakt im Ordner `attachments/` liegen:

```text
attachments/Infoblatt HTWG Scavengerhunt.pdf
attachments/Infoblatt HTWG.Scavengerhunt.pdf
```

Regionale Leads erhalten `Infoblatt HTWG Scavengerhunt.pdf`. Überregionale oder nicht eindeutig lokale Leads erhalten `Infoblatt HTWG.Scavengerhunt.pdf`.

## Ablauf

1. Du legst in Notion einen Lead an.
2. Du trägst mindestens `Website` ein.
3. Optional füllst du `E-Mail Prompt` oder `Gewünschter Preis`.
4. Du setzt `Automation Status` auf `Neu`.
5. Die Automation ergänzt öffentlich verfügbare Kontaktdaten.
6. Wenn eine sichere E-Mail gefunden wurde, erstellt sie einen Gmail-Entwurf.
7. Der Lead bleibt im Pipeline-Status `Lead`.
8. Du prüfst den Entwurf manuell in Gmail und klickst selbst auf `Senden`.
9. Beim nächsten Lauf erkennt die Automation den Versand und setzt den Pipeline-Status auf `E-Mail / Contacted`.
10. Nach 7 Tagen ohne erkannte Antwort wird ein Follow-up-Entwurf erstellt.
11. Wenn eine Antwort erkannt wird, wird der Lead auf `Interested` gesetzt.
12. Am Ende jedes Laufs werden CSV-Dateien für PowerBI im Ordner `dashboard/` aktualisiert.

## PowerBI Dashboard

Die Automation erzeugt diese Dateien:

```text
dashboard/crm-leads.csv
dashboard/crm-summary.csv
dashboard/crm-funnel.csv
dashboard/crm-automation-status.csv
dashboard/crm-category.csv
```

`crm-leads.csv` enthält eine Zeile pro Lead und ist die wichtigste Datenquelle für PowerBI. Die anderen Dateien enthalten vorberechnete Kennzahlen für schnelle Karten und Diagramme.

Empfohlene PowerBI-Visuals:

```text
KPI-Karten: Alle Leads, Entwürfe erstellt, Kontaktierte Leads, Interessierte Leads, Prüfen oder Fehler
Funnel/gestapeltes Balkendiagramm: crm-funnel.csv
Balkendiagramm: Leads nach Kategorie aus crm-category.csv
Tabelle: crm-leads.csv mit Firma, Website, Status, Datenqualität, Last Contacted, Automation Error
Karte: Geschätzte Minuten gespart aus crm-summary.csv
```

Damit die CSV-Dateien automatisch in GitHub gespeichert werden, braucht der Workflow Schreibrechte. In GitHub unter **Settings > Actions > General > Workflow permissions** muss **Read and write permissions** aktiv sein.

Die CSV-Dateien werden nur committed, wenn sich CRM-Daten wirklich geändert haben. Dadurch entstehen nicht alle 10 Minuten unnötige Commits.

## Test

1. In Notion einen Test-Lead mit Website anlegen.
2. `Automation Status` auf `Neu` setzen.
3. In GitHub Actions den Workflow **Run sponsor CRM automation** manuell starten.
4. Prüfen, ob Notion Kontaktdaten und Datenqualität ergänzt.
5. Prüfen, ob in Gmail ein Entwurf erstellt wurde.
6. Entwurf manuell senden.
7. Workflow erneut starten.
8. Prüfen, ob der Lead in Notion auf `E-Mail / Contacted` verschoben wurde.

## Sicherheit

- Keine E-Mail wird automatisch gesendet.
- Wenn keine sichere geschäftliche E-Mail gefunden wird, wird kein Entwurf erstellt.
- Private oder geschützte Daten werden nicht genutzt.
- Manuell gepflegte Notion-Felder werden nicht überschrieben.
- Fehler werden in `Automation Error` und `Notizen` gespeichert.
