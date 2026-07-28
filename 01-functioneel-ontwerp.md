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

Je sluit het venster met **Ctrl+Enter** — hetzelfde gebaar waarmee je in Outlook een
bericht verstuurt. De notitie is opgeslagen in `00 Inbox/`. Er verschijnt geen
bevestiging, geen dialoog, geen "weet je het zeker". Opslaan gebeurt ook al tijdens het
typen, zodat een crash of een dichtgeklapte laptop niets kost.

Wegklikken sluit het venster **niet**. Je tabt naar Teams om iets op te zoeken en komt
terug bij je notitie zoals je hem achterliet; wat er stond is intussen weggeschreven.
Esc doet bewust niets: die toets zit te veel in de vingers om er een halve notitie mee
te kunnen verliezen.

**Acceptatie:** van hotkey tot knipperende cursor minder dan 80 ms. Van gedachte tot
vastgelegd zonder één beslissing.

### 3.2 Een vergadering notuleren

Zelfde hotkey, zelfde venster, hetzelfde kopblok. Er valt niets uit te vouwen: het blok
heeft één vaste vorm van twee rijen, met een smalle kolom labels ervoor.

| | |
|---|---|
| **Wanneer** | datum en tijd, aanklikbaar om te wijzigen; daarnaast de knop *Vergadering* |
| **Tags** | vrije tekst, met aanvulling op eerder gebruikte tags |
| **Waar** | vrije tekst |
| **Wie** | meerdere namen, gescheiden door een komma of een puntkomma, met aanvulling op eerder ingevoerde namen |

Die vier velden staan er op **elke** notitie, niet alleen op een vergadering — zie B20 in
[05-besluitenlog.md](05-besluitenlog.md). Waar en wie zijn net zo goed van toepassing op
"even bijgepraat bij de koffie", en dat is precies wat je een half jaar later terugzoekt.
Een leeg veld schrijft niets, dus een notitie zonder die gegevens leest terug zoals hij
altijd deed.

De knop *Vergadering* zet `type: meeting` in de frontmatter, zodat je later op
vergaderingen kunt zoeken. Het is een etiket en niet meer dan dat: het bepaalt niet welke
velden er zijn, en omzetten verandert dus één regel in het bestand. In het
bibliotheekvenster verschijnt de knop alleen op een notitie die nog géén vergadering is —
daar promoveert hij alleen.

Bijlagen horen ook bij een vergadering, maar zijn nog niet te bewerken vanuit het kopblok;
`attachments:` in de frontmatter wordt wel gelezen en behouden.

Daaronder typ je in outline-vorm. Dit is de belangrijkste schrijfvorm en krijgt de
meeste aandacht (zie §4).

### 3.2a Terugvinden dwars door de mappen heen: tags en personen

Een map is één plek. Een notitie over klant X in `10 Projects` is onvindbaar vanuit
`20 Areas`, en dat is precies het moment waarop je terugvalt op Outlook-zoeken.

Onderin het linkerpaneel staan daarom twee lijsten, naast de prullenbak:

- **Tags** — alles wat in het tagveld van het capture-venster is getypt, plus elke
  `#tag` die ergens in een notitietekst staat. De twee worden samengevoegd; zie §3.8 van
  [03-markdown-dialect.md](03-markdown-dialect.md) voor wat als tag telt.
- **Personen** — de namen uit het veld *Wie*. Sinds B20 kan elke notitie die hebben, niet
  alleen een vergadering, en de notitielijst toont ze ook op een snelle notitie.

Beide lijsten staan op aantal gesorteerd, druk gebruikt bovenaan, met een filterveldje
zodra het er meer dan vijftien zijn. Kies je er een, dan toont de notitielijst alles uit
de hele vault dat erbij hoort, met per notitie de map waar hij staat — want zonder dat is
een lijst titels uit vijf verschillende mappen niet te lezen. De prullenbak telt niet
mee: een weggegooide notitie hoort niet via zijn tag terug te komen.

De lijsten worden pas opgebouwd wanneer je er een openklapt. Dat scheelt het doorlezen
van de hele vault bij elke keer dat het bibliotheekvenster opengaat, en het houdt de
capture-kant er volledig buiten.

### 3.2b Een notitie bijwerken in het hoofdvenster

Boven de tekst van de geopende notitie staat hetzelfde kopblok als in het
capture-venster, met dezelfde vier velden: wanneer, tags, waar en wie. Een verkeerd
gespelde naam of een vergeten tag is daarmee ter plekke te herstellen; tot nu toe kon dat
alleen door het bestand buiten de app te openen.

Eén ding zit er bewust *niet* in:

- **Het onderwerpveld.** De titel wijzig je met *Hernoemen*, want die actie past ook de
  bestandsnaam aan. Een tweede plek om hem te wijzigen zou de twee uit elkaar laten
  lopen.

En één ding staat er maar half in: de **vergaderknop** verschijnt alleen op een notitie
die nog geen vergadering is. Vroeger ontbrak hij helemaal, omdat terugzetten naar een
snelle notitie locatie en aanwezigen wíste — één misklik en een deelnemerslijst was weg.
Sinds B20 wist het niets meer, maar de omgekeerde richting blijft achterwege: er is geen
reden om een vergadering te dégraderen, en wat onbereikbaar is kan niet misgaan.

Wijzigingen worden op dezelfde manier bewaard als de tekst: 800 ms na de laatste
aanslag, en alleen wanneer de bytes werkelijk anders zijn (B10).

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

Niets hoeft te worden afgeleerd. Twintig jaar spiergeheugen is het belangrijkste dat de
mail-aan-jezelf-routine had; een editor die `Ctrl+B` ergens anders neerlegt is al
verloren, hoe goed de rest ook is.

**De volledige lijst staat in de app**, onder `F1` of `Ctrl+/`, en in het
bibliotheekvenster onderin het linkerpaneel. Die lijst wordt gegenereerd uit
`src/shared/shortcuts.ts`, hetzelfde bestand waaruit de toetsenbindingen zélf worden
opgebouwd — dus hij kan niet verouderen. Deze tabel stond hier eerder wel en was dat
inmiddels: hij noemde `Ctrl+Alt+1/2/3` zonder de `Ctrl+1..6` die er werkelijk zijn, liet
een handvol toetsen weg, en noemde er één die pas in fase 3 bestaat.

Wat hier blijft staan zijn de drie keuzes die *ontwerp* zijn en geen opsomming:

- **Koppen zijn `Ctrl+1` t/m `Ctrl+6`**, met Word's `Ctrl+Alt+1..6` ernaast als alias. Op
  Windows ís `Ctrl+Alt` namelijk AltGr, en op een Nederlandse indeling typt die
  combinatie tekens in plaats van een kop te maken.
- **Normale alinea is `Ctrl+0`** ("kop nul"), want Word's `Ctrl+Shift+N` is in Chromium
  "nieuw incognitovenster" en bereikt de pagina nooit.
- **`Ctrl+Enter` bewaart en sluit**, het gebaar waarmee in Outlook een bericht weggaat.
  `Escape` doet dit met opzet *niet*: die toets wordt reflexmatig ingedrukt, en een half
  getypte notitie is te makkelijk kwijt.

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
