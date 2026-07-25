# emqnote — bouwplan

Elke fase heeft **acceptatiecriteria**. Een fase is af als die aantoonbaar gehaald zijn,
niet als de code er staat. Fasen 0 tot en met 6 vormen v1.

---

## Fase −1 — Go/no-go

**Vóór er één regel code wordt geschreven.** Kost tien minuten, kan het hele project van
richting doen veranderen.

1. Download op de **Windows-werkmachine** een portable Electron-app — de zip-variant van
   VS Code is het makkelijkst — pak uit in `%LOCALAPPDATA%` en start hem.
2. Werkt dat? Dan is het pad vrij.
3. Werkt dat niet — AppLocker, WDAC, of een SmartScreen-blokkade zonder *Toch uitvoeren* —
   dan moet de aanpak om. Alternatieven, in volgorde van voorkeur:
   - Uitvoeren vanuit een map die op de toegestane lijst staat (vaak `%LOCALAPPDATA%`
     zelf, soms alleen `Program Files`)
   - Code-ondertekening met een eigen certificaat dat je door IT laat vertrouwen
   - Terugvallen op een webapp in de browser, met alle gevolgen voor snelheid en
     bestandstoegang

Tegelijk, want het kost niets: **kijk of Power Automate beschikbaar is** in je
M365-portaal. Zo niet, dan wordt het de Outlook-macro. Blokkeert niets, maar is fijn om
te weten vóór fase 6.

**Acceptatie:** een uitgepakte, ongetekende Electron-app start op de werkmachine en
blijft draaien.

---

## Fase 0 — Markdown-rondgang

Geen venster, geen editor, geen Electron. Alleen een TypeScript-pakket met parser,
serializer en tests.

**Werk:**

1. [03-markdown-dialect.md](03-markdown-dialect.md) omzetten in een ProseMirror-schema
2. Parser: markdown → ProseMirror-document (via `remark` naar mdast, dan naar PM)
3. Serializer: ProseMirror-document → markdown, deterministisch
4. Testcorpus: de 25 bestanden uit §8 van het dialectdocument, met de hand geschreven
   zoals ze er in de vault uit horen te zien
5. Rondgang-test die op **bytegelijkheid** valt, niet op "ziet er hetzelfde uit"

**Waarom dit eerst.** Alles wat later komt — de editor, plakken, e-mail-import — schrijft
via deze serializer. Blijkt in fase 3 dat geneste gemengde lijsten niet stabiel
terugkomen, dan moet het schema om en is alles wat erop leunde weggegooid werk.

**Acceptatie:**
- 25/25 bestanden bytegelijk heen en terug
- De omgekeerde richting (document → markdown → document) structureel gelijk
- De testsuite draait in minder dan 2 seconden, zodat hij bij elke wijziging aan staat

---

## Fase 1 — Residente schil

**Werk:**

- Electron-app met tray-icoon (Windows) / menubalk-icoon (macOS)
- Autostart bij inloggen
- Global hotkey, instelbaar, standaard `Ctrl+Shift+Space` / `Cmd+Shift+Space`
- Capture-venster: bij het starten aangemaakt en gerenderd, verborgen gehouden,
  `backgroundThrottling: false`
- Hotkey doet niets anders dan `show()` + focus
- Een `<textarea>` volstaat voorlopig — de echte editor komt in fase 2
- Opslaan naar `00 Inbox/` met de bestandsnaamregels uit
  [02-technisch-ontwerp.md](02-technisch-ontwerp.md#41-bestandsnamen)
- Vaultpad instelbaar, met automatische detectie van de OneDrive-map
- Controle op Files On-Demand bij eerste start, met instructie

**Meting vanaf dag één.** Een ingebouwde teller van hotkey-event tot `focus`-event in de
renderer, zichtbaar in een debugvenster en gelogd. Als dit getal in fase 1 al boven 80 ms
zit, is dat een architectuurprobleem — niet iets wat je later "optimaliseert".

**Acceptatie:**
- Hotkey → knipperende cursor **< 80 ms**, gemeten over 50 aanroepen, ook na een uur
  niets doen (dan heeft het OS het venster mogelijk uitgepaged)
- Tekst typen en venster sluiten levert een correct `.md`-bestand op in de Inbox
- Werkt op beide machines vanaf een uitgepakte map

---

## Fase 2 — De editor

**Werk:**

- ProseMirror op het schema uit fase 0, zonder tweede schemadefinitie
- Outlook-keymap, per platform de juiste modifier
- Lijstgedrag: `Tab`/`Shift+Tab` ongeacht cursorpositie, `Enter` op leeg item springt
  uit, `Shift+Enter` zachte regelovergang
- Kopblok: datum/tijd (automatisch, overschrijfbaar) en onderwerp
- Wisselen *snel* ↔ *vergadering*, met locatie, aanwezigen, bijlagen
- Aanvulling op eerder ingevoerde namen bij aanwezigen (uit de index)
- Opslaan koppelen aan de serializer uit fase 0
- Debounced, atomair schrijven

**Acceptatie:**
- Een outline van zes niveaus met gemengde bullets en nummering typt zonder één keer te
  corrigeren of naar de muis te grijpen
- Alle sneltoetsen uit de tabel werken op beide platforms
- Toetsaanslag → teken op scherm **< 16 ms**, ook in een notitie van 5.000 woorden
- Wat je typt en opslaat, komt na heropenen identiek terug
- Nergens een markdown-teken in beeld

---

## Fase 3 — Plakken en afbeeldingen

De pijplijn uit [02-technisch-ontwerp.md §6.3](02-technisch-ontwerp.md#63-plak-pijplijn).

**Werk:**

- `rehype`-pijplijn: opschonen, stijl vertalen, tabellen, afbeeldingen
- **Lijstreconstructie uit `mso-list`-metadata** — het zwaarste onderdeel
- Klembord-afbeeldingen naar `_attachments/JJJJ/MM/`
- Drag-and-drop van bestanden
- `Ctrl+Shift+V` voor platte tekst
- Verkleinen boven 2000 px met `sharp`, origineel bewaren

**Testcorpus:** tien echte mails uit je eigen 'Notes to self'-map, met lijsten,
tabellen, ingesloten screenshots en Teams-uitnodigingen. Bewaar ze als `.eml` in de
repo; ze dienen ook fase 6.

**Acceptatie:**
- Elk van de tien mails plakt in één keer goed: lijsten zijn lijsten, tabellen zijn
  tabellen, afbeeldingen staan op hun plek
- Geen `mso-`-resten, geen lege spans, geen HTML-drab in het `.md`-bestand
- Een screenshot plakken en de notitie sluiten levert een bestand in `_attachments/`
  en een werkende `![[…]]`-verwijzing
- Bij twijfel over de nesting liever een platte lijst dan een verkeerd geneste — dat is
  te repareren, het omgekeerde niet

---

## Fase 4 — Hoofdvenster

**Werk:**

- Drie panelen: mappenboom, notitielijst, editor
- Notitielijst sorteerbaar op gewijzigd / gemaakt / titel
- "Verplaats naar…" met fuzzy zoeken over de hele boom
- Slepen in de boom
- Hernoemen: titel in frontmatter én bestandsnaam
- Verwijderen naar prullenbak, nooit definitief
- Mappen aanmaken en hernoemen

**Acceptatie:**
- Notitie openen uit de lijst **< 50 ms**
- Een notitie verplaatsen naar een map vier niveaus diep kost drie toetsaanslagen plus
  Enter
- Verplaatsen breekt geen enkele afbeeldingsverwijzing
- Een notitie openen en weer sluiten zonder te typen **wijzigt het bestand niet** —
  te controleren met `mtime`

---

## Fase 5 — Zoeken en synchronisatie

**Werk:**

- SQLite FTS5-index in de lokale app-map
- Volledige scan bij eerste start, in een worker, met voortgang
- `chokidar`-watcher met 300 ms debounce, incrementeel herindexeren
- Zoekbalk met resultaten tijdens typen
- Scope-schakelaar globaal ↔ huidige map inclusief submappen
- Filters `type:`, `attendee:`, `tag:`, datumbereik
- Conflictdetectie op OneDrive-kopieën, met diff en drie keuzes
- Opruimactie voor verweesde bijlagen

**Acceptatie:**
- Zoekresultaten bijwerken **< 30 ms** bij een testvault van 5.000 notities
- Zoeken op een woord dat alleen in markdown-syntax voorkomt levert geen treffers op
- Een wijziging op de andere machine is binnen 5 seconden na OneDrive-synchronisatie
  zichtbaar en geïndexeerd
- Een bewust veroorzaakt conflict (beide machines offline bewerken) wordt herkend en met
  een leesbare diff aangeboden

---

## Fase 6 — E-mail

**Werk:**

- Verwerking van `00 Inbox/_incoming/`: `postal-mime`, dan de plak-pijplijn uit fase 3
- Bijlagen naar `_attachments/`, `cid:`-afbeeldingen omgezet
- Power Automate-flow inrichten (of de Outlook-macro als terugval)
- Importmodus voor de bulkmigratie naar `90 Archive/Mail-import/JJJJ/`
- Eenmalige Outlook-macro die de map 'Notes to self' als `.eml` dumpt

**Acceptatie:**
- Een mail naar jezelf staat binnen twee minuten als nette notitie in de Inbox
- De tien testmails uit fase 3 leveren via de e-mailroute hetzelfde resultaat op als via
  plakken — bewijs dat de pijplijn werkelijk gedeeld is
- De volledige historie is geïmporteerd, doorzoekbaar, met de oorspronkelijke datums
- Geen enkele mail is stilzwijgend overgeslagen; wat niet lukt komt in een foutenrapport

---

## v1 is af

Alle acceptatiecriteria van fase 0 tot en met 6 gehaald, plus:

- Een week op beide machines gedraaid zonder één conflictkopie
- De vault opent in Obsidian en alles toont correct, inclusief afbeeldingen en geneste
  lijsten
- Geheugengebruik van het residente proces gemeten en aanvaardbaar op de werklaptop

**En de echte test, die geen software kan afdwingen:** zes weken lang geen notitie meer
naar jezelf gemaild, behalve als je onderweg was.

---

## Na v1

In volgorde van waarschijnlijke waarde:

1. **iPhone-audio.** Opname in JustPressRecord of Dictafoon → iOS Shortcuts met
   on-device transcriptie (`Transcribe Audio`) → tekst plus audiobestand naar de
   OneDrive-map `_incoming/`. De app maakt er een notitie van met `source: audio`.
   Geen server, geen transcriptiedienst, niets verlaat het toestel behalve naar je eigen
   OneDrive.
2. **Sjablonen** in `_templates/`, zelf aan te passen: telefoongesprek, 1-op-1, besluit.
3. **Export** van een notitie of map naar pdf of docx, voor als er iets de deur uit moet.
4. **Notitie-onderlinge links** met aanvulling tijdens typen (`[[`).
5. **Terugkijkweergave** — wat legde ik deze week vast, wat staat er nog in de Inbox.

Bewust **niet** op deze lijst: grafiekweergave, plugins, thema's, samenwerken.
"Te veel app" was een van de vier redenen dat Obsidian het niet werd.
