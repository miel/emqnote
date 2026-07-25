# emqnote — functioneel ontwerp

## 1. Waarom

De huidige werkwijze voor werknotities: global shortcut → nieuwe mail in Outlook Classic
→ typen in de body met vertrouwde opmaaksneltoetsen → naar jezelf sturen → een regel
filtert naar de map 'Notes to self'.

Die routine is niet toevallig blijven hangen. Ze wint op drie dingen:

- **Snelheid.** Outlook staat altijd open. Het venster is er vóór de gedachte weg is.
- **Vingergevoel.** Ctrl+B, Ctrl+Shift+L, Tab — twintig jaar spiergeheugen.
- **Nul beslissingen.** Je hoeft niet te kiezen waar iets heen moet.

En ze verliest op drie dingen:

- **Terugvinden.** Outlook-zoeken is traag en niet gemaakt voor notities.
- **Bewerken.** Een verzonden mail is af; een notitie groeit.
- **Structuur.** Geen mappen, geen relaties, geen overzicht.

Eerdere vervangers zijn gestrand. **Evernote** mag niet op de werkmachine (privé blijft
het wel). **OneNote** valt af op het vrije canvas. **Obsidian** viel af op vier dingen
tegelijk: zichtbare markdown-tekens tijdens het typen, sneltoetsen die net anders zijn
dan Outlook, moeizaam plakken en afbeeldingen invoegen, en te veel app met te veel
keuzes. Maar de doorslag gaf iets specifiekers: **outlines gaan er niet lekker**. Een
mix van bullets en nummering over meerdere niveaus, met alinea's ingesprongen onder een
bullet — precies de vorm waarin de meeste werknotities worden geschreven.

Dus: emqnote moet winnen op snelheid en vingergevoel (anders wordt het niet gebruikt),
en daarbovenop terugvinden en structuur bieden (anders is het geen verbetering).

## 2. Kaders

| | |
|---|---|
| **Gebruikers** | Eén. Twee machines: Windows 11 werk (geen admin), Mac Mini (admin). |
| **Inhoud** | Uitsluitend werk. Privé blijft in Evernote. |
| **Opslag** | Zakelijke OneDrive — inhoud blijft daarmee binnen de werkomgeving. |
| **Formaat** | Markdown-bestanden in mappen. Leesbaar zonder de app. |
| **Netwerk** | Geen server, geen account, geen dienst. OneDrive doet de synchronisatie. |

## 3. De vijf werkwijzen

### 3.1 Snel iets vastleggen

Je drukt de global hotkey. Er verschijnt onmiddellijk een klein venster met de cursor
al knipperend in de tekst. Je typt. Er is geen dialoog, geen vraag waar het heen moet,
geen "nieuwe notitie"-knop.

Boven de tekst staat een smal kopblok met **datum/tijd** (automatisch ingevuld, maar
overschrijfbaar) en **onderwerp**. Het onderwerp mag leeg blijven; dan wordt de eerste
regel van de tekst de titel.

Je sluit het venster (Esc of Ctrl+W). De notitie is opgeslagen in `00 Inbox/`. Er
verschijnt geen bevestiging, geen dialoog, geen "weet je het zeker". Opslaan gebeurt
ook al tijdens het typen, zodat een crash of een dichtgeklapte laptop niets kost.

**Acceptatie:** van hotkey tot knipperende cursor minder dan 80 ms. Van gedachte tot
vastgelegd zonder één beslissing.

### 3.2 Een vergadering notuleren

Zelfde hotkey, zelfde venster. Eén toets (of klik op *Vergadering*) vouwt het kopblok
uit met drie extra velden:

- **Locatie** — vrije tekst
- **Aanwezigen** — meerdere namen, met aanvulling op eerder ingevoerde namen
- **Bijlagen** — verwijzingen naar bestanden die bij de vergadering horen

Daaronder typ je in outline-vorm. Dit is de belangrijkste schrijfvorm en krijgt de
meeste aandacht (zie §4).

Notitietype wordt onthouden als `type: meeting` in de frontmatter, zodat je later
kunt zoeken op vergaderingen of op wie erbij was.

### 3.3 Opruimen: van Inbox naar project

Alles landt in `00 Inbox/`. Op een rustig moment open je het hoofdvenster en verplaats
je notities naar de projectmappen — vaak meerdere niveaus diep, per klant en project.

Verplaatsen gaat via een "verplaats naar…"-actie met fuzzy zoeken over de hele
mappenboom: je typt `alph rap` en krijgt `10 Projects/Klant X/Project Alpha/Rapportage`.
Slepen in de boom kan ook.

Verplaatsen mag nooit iets breken. Omdat verwijzingen naar bijlagen wikilinks zijn
(`![[bestand.png]]`), die vault-breed op naam worden opgelost, blijven afbeeldingen
werken waar de notitie ook heen gaat.

### 3.4 Terugvinden

Eén zoekveld, resultaten vanaf de eerste toetsaanslag. Er wordt gezocht in de titel,
in de frontmatter-velden en in de **platte tekst** van de notitie — markdown-tekens zijn
uit de index gestript, zodat je niet per ongeluk op syntax stuit.

Standaard globaal. Eén schakelaar beperkt het tot de map waarin je staat, inclusief
submappen.

Filters die je kunt combineren met de zoektekst:

- `type:meeting` — alleen vergadernotities
- `attendee:"Jan de Vries"` — vergaderingen met deze persoon
- `tag:offerte`
- datumbereik

**Acceptatie:** bijwerken van resultaten binnen 30 ms bij 5.000 notities.

### 3.5 Het vangnet: mail naar jezelf

De e-mailroutine verdwijnt niet, hij wordt een **ingang**. Als je onderweg bent, of op
een machine zonder de app, of gewoon uit gewoonte: je mailt naar jezelf zoals altijd.
Die mail komt automatisch als notitie in `00 Inbox/` terecht, met opmaak, lijsten en
bijlagen intact.

Dat is geen tijdelijke concessie maar een bewuste bodem in de constructie: als de app
ooit niet start, of geblokkeerd wordt, of je zit op een vreemde machine — je kunt altijd
nog vastleggen, en het komt goed terecht.

Daarnaast wordt je **bestaande** map 'Notes to self' eenmalig volledig geïmporteerd naar
`90 Archive/Mail-import/JJJJ/`, met de oorspronkelijke datum. Je begint dus niet met een
lege app maar met je hele geschiedenis, doorzoekbaar.

## 4. De editor

Dit is waar het project op slaagt of faalt.

### 4.1 Wat je ziet is wat het is

Nooit een sterretje, hekje of vierkant haakje in beeld tijdens het typen. Vet is vet.
Markdown bestaat wel op schijf, maar niet op het scherm.

### 4.2 Sneltoetsen, letterlijk die van Outlook

| Actie | Windows | macOS |
|---|---|---|
| Vet / cursief / onderstreept | `Ctrl+B` / `I` / `U` | `Cmd+B` / `I` / `U` |
| Opsomming aan/uit | `Ctrl+Shift+L` | `Cmd+Shift+L` |
| Kop 1 / 2 / 3 | `Ctrl+Alt+1/2/3` | `Cmd+Alt+1/2/3` |
| Normale tekst | `Ctrl+Shift+N` | `Cmd+Shift+N` |
| Inspringen / uitspringen | `Ctrl+M` / `Ctrl+Shift+M` | `Cmd+M` / `Cmd+Shift+M` |
| Hyperlink | `Ctrl+K` | `Cmd+K` |
| Plakken zonder opmaak | `Ctrl+Shift+V` | `Cmd+Shift+V` |
| Markeren | `Ctrl+Alt+H` | `Cmd+Alt+H` |

Niets hoeft te worden afgeleerd.

### 4.3 Outlines

De kern van de zaak. Wat moet werken:

- **Gemengde niveaus.** Een genummerde lijst met daaronder bullets, met daaronder
  weer nummering. In willekeurige volgorde, tot minstens zes niveaus diep.
- **Alinea's onder een bullet.** Een lijstitem kan meer bevatten dan één regel:
  meerdere alinea's, een tabel, een afbeelding — allemaal netjes uitgelijnd onder het
  bulletteken.
- **`Tab` / `Shift+Tab`** springen het huidige item in of uit, óók als de cursor midden
  in de tekst staat. Nummering hernummert zichzelf.
- **`Enter`** maakt een nieuw item op hetzelfde niveau. **`Shift+Enter`** maakt een
  nieuwe regel bínnen het item. **`Enter` op een leeg item** springt een niveau uit, en
  op niveau 1 verlaat het de lijst.
- **Nummering blijft doorlopen** als er tussenliggende inhoud staat.

### 4.4 Plakken

Plakken uit Outlook, Teams, Word of een browser moet er ná het plakken uitzien zoals
ervóór. Concreet betekent dat:

- Vet, cursief, onderstreept, markeren, koppen en links blijven.
- **Lijsten uit Outlook worden echte lijsten.** Outlook exporteert lijsten niet als
  lijst maar als losse alinea's met verborgen nummeringsinformatie; die structuur wordt
  gereconstrueerd.
- Tabellen worden tabellen.
- Ingesloten afbeeldingen worden opgeslagen als bestand en ingevoegd.
- Word- en Outlook-rommel (lege spans, `mso-`-stijlen, conditionele commentaren)
  verdwijnt, zodat je een schone notitie krijgt en geen HTML-drab.

`Ctrl+Shift+V` plakt platte tekst, voor als je juist geen opmaak wilt.

### 4.5 Afbeeldingen

- Screenshot op het klembord (Windows Snipping Tool, `Cmd+Shift+4` op Mac) plak je
  direct in de notitie.
- Bestanden slepen vanuit Verkenner of Finder werkt.
- Alles landt in de centrale map `_attachments/JJJJ/MM/` met een tijdstempel in de naam.
  De notitie bevat alleen een verwijzing.
- Niet-afbeeldingen (pdf, xlsx) worden een klikbare link die het bestand opent.

## 5. Ordening

```
00 Inbox/            alles komt hier binnen
10 Projects/         <Klant>/<Project>/… — zelf beheerd, meerdere niveaus diep
20 Areas/            wat langer meegaat dan een project
90 Archive/          afgerond, plus de eenmalige mail-import
_attachments/        alle afbeeldingen en bijlagen, per jaar/maand
_templates/          sjablonen die je zelf kunt aanpassen
```

De mappenstructuur is van jou. De app dwingt niets af behalve `00 Inbox/`,
`_attachments/` en `_templates/`.

## 6. Buiten scope

| Niet | Waarom |
|---|---|
| Privénotities | Blijven in Evernote. Andere behoefte, andere omgeving. |
| Agenda-koppeling | Je vult onderwerp/locatie/aanwezigen liever zelf. |
| Web clipper | Privébehoefte (Evernote), niet deze werk-app. |
| Samenwerken, delen | Eén gebruiker, twee machines. |
| Grafiekweergave, backlinks, plugins | "Te veel app" was juist een van de bezwaren. |
| iPhone-audio met transcriptie | Wel gewenst, maar ná v1. Zie [04-bouwplan.md](04-bouwplan.md). |

## 7. Wanneer is het geslaagd

Niet als de functielijst af is, maar als dit waar is:

> **Zes weken lang geen enkele notitie meer naar jezelf gemaild** — behalve als je
> onderweg was.

Meetbare voorwaarden daarvoor:

- Hotkey → knipperende cursor onder 80 ms
- Toetsaanslag → teken op scherm onder 16 ms
- Zoekresultaten onder 30 ms bij 5.000 notities
- Een outline van zes niveaus met gemengde bullets en nummering typt zonder één keer
  te corrigeren
- Een Outlook-mail met lijsten, een tabel en twee screenshots plakt in één keer goed
- Na een week op twee machines: geen conflictkopieën in de vault
