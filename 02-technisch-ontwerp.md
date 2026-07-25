# emqnote — technisch ontwerp

## 1. Het leidende principe

> **Markdown wordt maar op één plek geschreven.**

Elke bron van inhoud — typen in de editor, plakken uit Outlook, een geïmporteerde
e-mail — wordt eerst omgezet naar hetzelfde ProseMirror-document. Alleen de
ProseMirror-serializer schrijft `.md`.

```
HTML (plakken / e-mail / import) ──┐
                                   ├──→  ProseMirror-document  ──→  markdown-serializer  ──→  .md
Toetsenbordinvoer ─────────────────┘             ▲
                                                 │
                                       markdown-parser  ←──  .md van schijf
```

Waarom dit zo belangrijk is: zodra er twee wegen naar markdown bestaan, drijven ze uit
elkaar. Dan produceert een geplakte lijst subtiel andere inspringing dan een getypte
lijst, en breekt de rondgang precies bij de constructies die je het vaakst gebruikt.
Eén pad, één testsuite.

## 2. Stack

| Laag | Keuze | Waarom |
|---|---|---|
| Schil | **Electron** + TypeScript | Eén Chromium op Windows én macOS — zie §2.1 |
| UI | React | Alleen voor het kopblok en de vensterschil |
| Editor | **ProseMirror** rechtstreeks | Eén schema voor bestandsformaat én editor — zie B17 |
| Markdown | Eigen serializer/parser op `remark`/`mdast` | Het dialect is te specifiek voor een kant-en-klare |
| HTML-normalisatie | `rehype` + eigen regels | AST-gebaseerd, testbaar, deelbaar met de e-mail-import |
| Index | **SQLite FTS5** via `better-sqlite3` | Synchroon, snel, geen serverproces |
| Bestandsbewaking | `chokidar` | Beproefd op Windows en macOS |
| Afbeeldingen | `sharp` | Formaat aanpassen en normaliseren bij plakken |
| E-mail | `postal-mime` | `.eml` parsen inclusief bijlagen en `cid:`-afbeeldingen |
| Bouwen | GitHub Actions + `electron-builder` | Windows- én macOS-artefacten uit één repo |

### 2.1 Electron in plaats van Tauri

Tauri is kleiner (~10 MB tegen ~150 MB) en start sneller. Toch valt de keuze op
Electron, om één reden: **Tauri gebruikt op Windows WebView2 (Chromium) en op macOS
WKWebView (WebKit)**. Twee verschillende renderengines.

Precies de onderdelen waar dit project op staat of valt, verschillen tussen die twee:

- Klembord-HTML uit Outlook wordt anders aangeleverd en anders geïnterpreteerd
- `contenteditable`-gedrag in geneste lijsten kent bekende WebKit-eigenaardigheden
- Drag-and-drop van bestanden werkt anders
- Selectie- en cursorgedrag rond blokgrenzen verschilt

De editor is de kroonjuweel. Die wil je één keer goed krijgen en niet twee keer, met
twee sets bugs die je op verschillende machines moet reproduceren.

Het snelheidsbezwaar wordt niet opgelost door een kleiner framework maar door
**residente architectuur** (§3.1). Koude start telt dan één keer per dag, bij inloggen.

Bijkomend voordeel: `better-sqlite3`, `chokidar` en `sharp` zijn volwassen Node-modules.
In Tauri zou daar een Rust-equivalent en een bridge voor nodig zijn.

## 3. Procesindeling

### 3.1 Main-proces (Node)

Draait continu, ook als er geen venster zichtbaar is.

- **Tray/menubalk-icoon** en autostart bij inloggen
- **Global hotkey** (`globalShortcut`) → `captureWindow.show()` + focus
- **Venstersbeheer**: het capture-venster wordt bij het starten al aangemaakt en
  gerenderd, maar verborgen gehouden. `backgroundThrottling: false` zodat Chromium het
  verborgen venster niet in slaapstand zet.
- **Bestands-I/O**: alle lezen en schrijven gebeurt hier, nooit in de renderer
- **Watcher** (`chokidar`) op de vault → herindexeren, conflicten detecteren,
  `_incoming/` verwerken
- **Index** (SQLite) — synchrone queries, dus geen wachttijd bij zoeken

### 3.2 Renderer-processen

- **Capture-venster** — voorgeladen, verborgen, met een lege editor-instantie die al
  gemonteerd is. Tonen kost alleen nog `show()`.
- **Hoofdvenster** — mappenboom, notitielijst, editor. Wordt lui aangemaakt bij eerste
  gebruik.

### 3.3 Latency-budget

Harde eisen, geautomatiseerd gemeten, de build faalt eronder:

| Meting | Budget |
|---|---|
| Hotkey → knipperende cursor | **< 80 ms** |
| Toetsaanslag → teken op scherm | **< 16 ms** (één frame) |
| Zoekresultaten bijwerken tijdens typen, 5.000 notities | **< 30 ms** |
| Notitie openen vanuit de lijst | **< 50 ms** |
| Koude start tot tray-icoon | **< 3 s** (eenmalig bij inloggen) |

Maatregelen die deze budgetten halen:

- Niets scannen bij het tonen van het capture-venster — de index is al warm
- Opslaan is asynchroon en debounced; typen wordt nooit geblokkeerd
- Geen animaties op het tonen van het venster
- Zware afhankelijkheden (`sharp`, `postal-mime`) worden lui geladen, niet bij start

## 4. Vault-indeling

Op de zakelijke OneDrive. Korte hoofdmap in verband met de 260-tekens-padlimiet van
Windows.

```
<OneDrive>/emqnote/
├── 00 Inbox/
│   └── _incoming/              ← afleverpunt voor e-mail-ingest
├── 10 Projects/<Klant>/<Project>/…
├── 20 Areas/
├── 90 Archive/
│   └── Mail-import/JJJJ/
├── _attachments/JJJJ/MM/
│   └── 2026-07-25-1432-schermafbeelding.png
├── _templates/
│   ├── snel.md
│   └── vergadering.md
└── .emqnote/
    └── config.json             ← zelden geschreven, gedeelde instellingen
```

### 4.1 Bestandsnamen

Patroon: `JJJJ-MM-DD UUmm Onderwerp.md` → `2026-07-25 1432 Kickoff project Alpha.md`

Regels, streng vanwege Windows:

- Verboden tekens `\ / : * ? " < > |` worden vervangen door `-`
- Namen die op Windows gereserveerd zijn (`CON`, `PRN`, `AUX`, `NUL`, `COM1`…) krijgen
  een onderstrepingsteken erachter
- Afkappen op 80 tekens
- Geen punt of spatie aan het eind (Windows verwijdert die stil)
- Bij botsing: ` (2)` erachter

### 4.2 Frontmatter

```yaml
---
title: Kickoff project Alpha
type: meeting                    # quick | meeting
created: 2026-07-25T14:32:00+02:00
modified: 2026-07-25T15:10:00+02:00
location: Teams
attendees: [Jan de Vries, Els Bakker]
attachments: [2026-07-25-1432-agenda.pdf]
tags: [klantx, offerte]
source: manual                   # manual | email | import
---
```

Alleen `title`, `created` en `type` zijn verplicht. Lege velden worden weggelaten, niet
als lege string geschreven — dat houdt de bestanden schoon.

### 4.3 Wat níét in de vault staat

Index, instellingen en vensterstaat horen **lokaal**, niet in OneDrive:

- macOS: `~/Library/Application Support/emqnote/`
- Windows: `%LOCALAPPDATA%\emqnote\`

Bevat: `index.db`, `settings.json`, `window-state.json`, cache van miniaturen.

Zou de SQLite-database in de vault staan, dan maakt OneDrive er conflictkopieën van
zodra beide machines draaien — en een half gesynchroniseerde SQLite-database is een
kapotte SQLite-database.

## 5. Synchronisatie via OneDrive

Er is geen synchronisatielaag in de app. OneDrive doet het werk. De app moet zich
alleen zó gedragen dat OneDrive geen conflicten hoeft te maken.

### 5.1 Schrijfstrategie

1. **Pas schrijven bij rust.** 800 ms na de laatste toetsaanslag, of direct bij
   focusverlies of sluiten van het venster.
2. **Atomair.** Schrijven naar `bestand.md.tmp` in dezelfde map, dan `rename()`.
   Zo ziet OneDrive nooit een half bestand.
3. **Nooit ongevraagd herschrijven.** Een notitie openen mag het bestand niet aanraken.
   Geen herformattering, geen `modified`-bijwerking, geen normalisatie. Alleen een
   echte gebruikerswijziging schrijft.
4. **Vergelijken vóór schrijven.** Als de geserialiseerde inhoud byte-identiek is aan
   wat er staat, wordt er niet geschreven.

Punt 3 en 4 zijn samen de belangrijkste conflictpreventie: verreweg de meeste
conflictkopieën ontstaan doordat een app bestanden aanraakt die de gebruiker niet heeft
gewijzigd.

### 5.2 Conflicten herkennen

OneDrive maakt bij een botsing een kopie met de machinenaam erin:
`Kickoff project Alpha-LAPTOP-ABC123.md`, soms `… (1).md`.

De watcher herkent dat patroon, koppelt de kopie aan het origineel en toont een banner:
*"Deze notitie is op twee machines gewijzigd."* Met een regel-voor-regel-diff en drie
keuzes: **deze houden**, **die houden**, of **samenvoegen** in de editor. Pas na een
keuze wordt de conflictkopie opgeruimd — nooit automatisch.

### 5.3 Files On-Demand

OneDrive's *Files On-Demand* laat bestanden als lege placeholder op schijf staan. Een
indexer die zo'n bestand leest, krijgt niets terug — of veroorzaakt een blokkerende
download van honderden bestanden.

Daarom:

- Bij eerste start controleert de app of de vaultmap op *Altijd behouden op dit
  apparaat* staat (Windows: `FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS`; macOS: de
  `com.apple.fileprovider` dataless-vlag) en waarschuwt met de instructie als dat niet zo is.
- Alle bestandslezingen zijn asynchroon met een time-out. Een niet-gehydrateerd bestand
  blokkeert nooit de UI; het wordt overgeslagen en later opnieuw geprobeerd.

## 6. De editor

### 6.1 Schema

Het schema uit `src/markdown/schema.ts` is óók het schema van de editor; er is geen
tweede definitie. Het bevat daarom naast de markdown-structuur ook `toDOM` en
`parseDOM`. De kern:

- `listItem` accepteert **blok-inhoud** (`paragraph block*`), niet alleen inline. Dit is
  de technische voorwaarde voor "alinea's ingesprongen onder een bullet" en voor geneste
  lijsten van gemengd type.
- `underline` als mark → serialiseert naar `<u>`
- `highlight` als mark → serialiseert naar `==tekst==`
- `orderedList` behoudt het `start`-attribuut
- Tabellen (GFM), takenlijsten, code-blokken, horizontale lijn
- `wikiEmbed`-node voor `![[bestand.png]]` en `wikiLink`-node voor `[[Notitie]]`

### 6.2 Keymap

De Outlook-sneltoetsen uit [01-functioneel-ontwerp.md](01-functioneel-ontwerp.md#42-sneltoetsen-letterlijk-die-van-outlook)
worden als ProseMirror-keymap geïmplementeerd, met per platform de juiste modifier.

Lijstgedrag, aandachtspunt per punt:

| Toets | Gedrag |
|---|---|
| `Tab` | Item inspringen, ongeacht cursorpositie binnen het item |
| `Shift+Tab` | Item uitspringen; op niveau 1 verlaat het de lijst |
| `Enter` | Nieuw item op hetzelfde niveau |
| `Enter` op leeg item | Eén niveau uit; op niveau 1: lijst verlaten |
| `Shift+Enter` | Zachte regelovergang bínnen het item |
| `Ctrl+M` / `Ctrl+Shift+M` | In-/uitspringen, ook buiten lijsten (blockquote-achtig) |

Standaard-`Tab` van ProseMirror wisselt focus; dat moet expliciet worden overschreven.

### 6.3 Plak-pijplijn

Bij een plakactie wordt `text/html` verkozen boven `text/plain`. De HTML gaat door
`rehype` met deze stappen, in volgorde:

1. **Voorbewerking** — conditionele commentaren (`<!--[if gte mso 9]>`) verwijderen
2. **Lijstreconstructie** — Outlook en Word exporteren lijsten *niet* als `<ul>`/`<ol>`
   maar als losse `<p class=MsoListParagraph>` met een `style="mso-list:l0 level2 lfo1"`.
   Uit `level*` volgt het niveau, uit het eerste teken van de alinea (`·`, `o`, `1.`,
   `a.`) volgt of het een bullet of nummering is. Daaruit wordt een echte geneste
   lijststructuur opgebouwd. **Dit is het meeste werk van de hele pijplijn en is de
   reden dat plakken uit Outlook nu overal misgaat.**
3. **Stijl vertalen** — `font-weight:bold` → sterk, `text-decoration:underline` →
   onderstreept, `background-color` → markeren, lettergrootte-heuristiek → kop
4. **Opschonen** — alle `mso-*`-eigenschappen, lege `<span>`s, `<o:p>`, `class`- en
   `lang`-attributen weg
5. **Tabellen** — naar GFM-tabel; bij samengevoegde cellen blijft het een HTML-tabel
   (GFM kan die niet uitdrukken)
6. **Afbeeldingen** — `data:`-URI's en `cid:`-verwijzingen worden weggeschreven naar
   `_attachments/JJJJ/MM/` en vervangen door een `wikiEmbed`
7. **Naar ProseMirror** — via `generateJSON` met het eigen schema

`Ctrl+Shift+V` slaat de hele pijplijn over en plakt `text/plain`.

**Deze pijplijn wordt gedeeld met de e-mail-import.** Een geïmporteerde mail is niets
anders dan geplakte HTML die uit een `.eml` komt in plaats van uit het klembord.

### 6.4 Afbeeldingen en bijlagen

- Klembord-afbeelding → PNG naar `_attachments/JJJJ/MM/JJJJ-MM-DD-UUmm-afbeelding-N.png`
- Gesleept bestand → gekopieerd naar dezelfde map, originele naam met tijdstempel ervoor
- Afbeeldingen breder dan 2000 px worden verkleind (`sharp`); het origineel blijft naast
  het verkleinde bestand staan met `-orig` in de naam
- Invoegen als `![[bestandsnaam.png]]` — géén pad. Obsidian lost wikilinks vault-breed
  op naam op, dus het verplaatsen van een notitie breekt niets. De tijdstempel-prefix
  garandeert unieke namen.
- Niet-afbeeldingen → `[[bestand.pdf]]` als klikbare link die het systeemprogramma opent

### 6.5 Verweesde bijlagen

Een opruimactie (handmatig, nooit automatisch) zoekt bestanden in `_attachments/` waar
geen enkele notitie naar verwijst, en toont ze met een miniatuur. Verwijderen is altijd
een expliciete keuze van de gebruiker.

## 7. Index en zoeken

### 7.1 Schema

```sql
CREATE TABLE notes (
  path TEXT PRIMARY KEY,      -- relatief aan de vault
  title TEXT,
  type TEXT,
  created TEXT,
  modified TEXT,
  location TEXT,
  attendees TEXT,             -- JSON-array
  tags TEXT,                  -- JSON-array
  mtime INTEGER,              -- van het bestandssysteem, voor wijzigingsdetectie
  size INTEGER,
  hash TEXT                   -- inhoud-hash, om echte wijzigingen te onderscheiden
);

CREATE VIRTUAL TABLE notes_fts USING fts5(
  title, body, attendees, tags,
  content='', tokenize='unicode61 remove_diacritics 2'
);
```

`body` bevat de **platte tekst**: markdown-tekens gestript, frontmatter eruit, wikilinks
teruggebracht tot hun naam. Zo levert zoeken op `bijlage` geen treffers op syntax.

`remove_diacritics 2` zorgt dat *vergadering* en *vergaderíng* elkaar vinden — en
belangrijker voor Nederlands: dat je op *Ruben* zoekt en *Rubén* vindt.

### 7.2 Bijwerken

- Eerste start: volledige scan met voortgangsbalk, in een worker
- Daarna: `chokidar` met 300 ms debounce → per gewijzigd bestand herindexeren
- Vergelijking op `mtime` + `size`, en pas bij twijfel de inhoud-hash — dat scheelt bij
  een OneDrive-synchronisatie die honderden bestanden aanraakt zonder ze te wijzigen
- Volledige herindexering alleen handmatig

### 7.3 Query

Zoekbalk parseert filters uit de tekst:

```
offerte type:meeting attendee:"Jan de Vries" tag:klantx na:2026-01-01
```

Wat overblijft gaat als FTS5-`MATCH` met prefix-zoeken (`offerte*`) zodat resultaten
tijdens het typen meebewegen. De scope-schakelaar voegt een `path LIKE 'huidige/map/%'`
toe.

## 8. E-mail-ingest

### 8.1 Het contract is een map

Wat er ook mail aflevert, het levert af in `00 Inbox/_incoming/`:

```
_incoming/
  2026-07-25T1432-a3f9.eml           ← of .html + .json met metadata
  2026-07-25T1432-a3f9/              ← bijlagen, indien aanwezig
    offerte.pdf
```

De watcher pikt het op, parseert met `postal-mime`, jaagt de HTML-body door dezelfde
pijplijn als plakken (§6.3), schrijft de notitie naar `00 Inbox/` met
`source: email` en de oorspronkelijke verzenddatum als `created`, verplaatst bijlagen
naar `_attachments/`, en verwijdert het bronbestand.

Door dit als map-contract te definiëren is de leverancier vervangbaar zonder dat er één
regel app-code verandert.

### 8.2 Leveranciers, in volgorde van voorkeur

**1 — Power Automate** (voorkeur)

- Trigger: *When a new email arrives (V3)*, map `Notes to self`
- Actie: *Create file* in OneDrive for Business, pad `emqnote/00 Inbox/_incoming/`
- Body als `.html`, plus een `.json` met afzender, onderwerp en verzenddatum
- Bijlagen via *Apply to each* naar de submap

Voordelen: geen nieuw e-mailadres, niets verlaat de tenant, geen machine hoeft aan te
staan, geen code. Voorwaarde: Power Automate moet beschikbaar zijn in de M365-licentie
en niet door beleid geblokkeerd.

**2 — Outlook-macro** (terugval)

Een *"run a script"*-regel in Outlook Classic op dezelfde map, die het bericht als
`.eml` naar `_incoming/` schrijft. Vereist geen admin (macro-instellingen staan in de
gebruikers-registry). Werkt alleen als Outlook draait — wat in de praktijk altijd zo is.

**3 — Extern adres** (afgeraden)

`notes@eigendomein.nl`, opgehaald door de Mac Mini via IMAP. Het meest Evernote-achtig,
maar werkmail loopt dan via een externe mailbox — precies wat de keuze voor OneDrive
juist wilde vermijden. Alleen als 1 en 2 allebei geblokkeerd blijken, en dan met opzet.

### 8.3 Eenmalige migratie

Dezelfde route, andere hoeveelheid. Een Outlook-macro dumpt de volledige map
'Notes to self' als `.eml` in `_incoming_bulk/`. Een aparte importmodus verwerkt die
naar `90 Archive/Mail-import/JJJJ/` met de oorspronkelijke datum in bestandsnaam en
frontmatter, `source: import`, en een voortgangsbalk.

Alles wat de import doet, gebruikt code die er al is: `postal-mime`, de plak-pijplijn,
de bestandsnaamsanering, de bijlagenafhandeling.

## 9. Bouwen en uitrollen

GitHub Actions op een **privé**-repository:

- `macos-14` → `.app` (arm64), ad-hoc gesigneerd
- `windows-latest` → `.zip` met een portable, uitgepakte map — géén installer

Waarom een zip en geen installer: zonder admin is een installer alleen maar een extra
hindernis, en een uitgepakte map die je vanaf OneDrive kunt starten is het minst
kwetsbaar voor beleid. Automatisch bijwerken is er niet; nieuwe versie is: map
vervangen.

**Ondertekening.** De Windows-binary is niet ondertekend. SmartScreen zal bij de eerste
start waarschuwen; dat is met *Meer informatie → Toch uitvoeren* te passeren, tenzij
beleid het verbiedt — wat precies de go/no-go-test uit
[04-bouwplan.md](04-bouwplan.md#fase--1--go-no-go) is.

## 10. Risico's

| Risico | Ernst | Aanpak |
|---|---|---|
| AppLocker/WDAC blokkeert een ongetekende `.exe` | **Fataal** | Testen vóór regel één code. Bij blokkade verandert de hele aanpak. |
| Rondgang-verlies bij complexe outlines | Hoog | Fase 0: bytegelijke rondgang als voorwaarde voor alle volgende fasen |
| Outlook-lijsten reconstrueren blijkt weerbarstig | Hoog | Corpus van echte mails als testset; bij twijfel liever een platte lijst dan een verkeerd geneste |
| OneDrive-conflicten | Middel | Index buiten de vault, atomair schrijven bij rust, nooit ongevraagd herschrijven, diff bij conflict |
| Files On-Demand geeft lege bestanden | Middel | Controle bij eerste start, asynchroon lezen met time-out |
| Windows-padlengte (260 tekens) | Middel | Korte vaultnaam, namen afkappen op 80 tekens, waarschuwen bij diepe mappen |
| Electron-geheugen op een werklaptop | Laag | Eén resident proces, één verborgen venster; meten en tonen |
| `better-sqlite3` native module per platform | Laag | GitHub Actions bouwt per platform; `electron-rebuild` in de pijplijn |
