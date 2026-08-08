# emqnote — besluitenlog

Elk besluit met de afweging erachter en wat er is afgevallen. Bedoeld om over een half
jaar terug te lezen als je je afvraagt waarom iets zo is.

Alle besluiten zijn genomen op **25 juli 2026**, tijdens de ontwerpsessie.

---

## B1 — Zelf bouwen, niet forken

**Genomen.** Er komt een nieuwe codebase.

**Overwogen:** een bestaande open-source notitie-app forken en bijschaven.

**Waarom niet.** Het landschap afgelopen: er is geen app die "map met platte `.md`" én
échte WYSIWYG én Outlook-waardige outlines combineert.

| Kandidaat | Waarom niet |
|---|---|
| Obsidian | Gesloten bron, en juist de app die is afgevallen |
| Noteriv, ZenNotes, Zettlr, MarkText | Tonen markdown-tekens tijdens het typen |
| Typora, SoloMD | Editors zonder vault-beheer, zoeken of capture |
| Joplin, SiYuan, AppFlowy, Anytype | Eigen database in plaats van platte bestanden |
| Trilium, Outline, Docmost | Server-apps, HTML- of blokgebaseerd, teamgericht |

Forken zou hier neerkomen op een vreemde codebase leegslopen om er precies de twee
dingen in te bouwen die het onderscheid moeten maken. De baten van een fork — bestaande
functionaliteit meekrijgen — zitten juist in de functionaliteit die *niet* gewenst is
("te veel app").

**Wel hergebruiken, geen wiel opnieuw:** ProseMirror voor de editor, `remark`
voor markdown, `rehype` voor HTML, SQLite FTS5 voor zoeken, `postal-mime` voor e-mail.

---

## B2 — Electron, niet Tauri

**Genomen.** Electron + TypeScript.

**Overwogen:** Tauri v2 — kleiner (~10 MB tegen ~150 MB), sneller opgestart, minder
geheugen.

**Waarom niet.** Tauri gebruikt op Windows WebView2 (Chromium) en op macOS WKWebView
(WebKit). Twee renderengines. En de dingen die tussen die twee verschillen, zijn precies
de dingen waar dit project op staat of valt: klembord-HTML uit Outlook,
`contenteditable`-gedrag in geneste lijsten, drag-and-drop van bestanden, cursorgedrag
rond blokgrenzen. De editor is de kroonjuweel; die wil je één keer goed krijgen.

Bijkomend: `better-sqlite3`, `chokidar` en `sharp` zijn volwassen Node-modules waar in
Tauri een Rust-equivalent plus bridge voor nodig zou zijn.

**Het snelheidsbezwaar is niet weggewuifd maar verplaatst.** Zie B3.

**Wanneer dit besluit heroverwogen moet worden:** als het residente Electron-proces op de
werklaptop merkbaar in de weg zit naast Outlook en Teams, of als het geheugengebruik in
fase 1 boven de 400 MB uitkomt.

---

## B3 — Residente architectuur tegen lag

**Genomen.** De app draait continu in tray/menubalk, met een voorgerenderd maar verborgen
capture-venster. De hotkey doet alleen `show()` + focus.

**Waarom.** "Ik haat lag" is een harde eis, en de reden dat de Outlook-routine wint:
Outlook staat altijd open, dus het nieuwe-mailvenster is er onmiddellijk. Dat is geen
eigenschap van Outlook maar van *altijd open staan*. Die eigenschap is overneembaar.

Koude start speelt dan één keer per dag, bij inloggen. Framework-keuze wordt daarmee
grotendeels irrelevant voor waargenomen snelheid — wat B2 mogelijk maakt.

**Gevolg:** er zijn harde, gemeten latency-budgetten (80 ms hotkey→cursor, 16 ms
toetsaanslag, 30 ms zoeken) die de build laten falen. Snelheid is een testbaar criterium,
geen aspiratie.

---

## B4 — Markdown als opslagformaat, WYSIWYG als bewerkingservaring

**Genomen.** Bestanden op schijf zijn markdown. In beeld verschijnt nooit een
markdown-teken.

**De schijnbare tegenspraak.** Obsidian is afgevallen *vanwege* markdown, en toch wordt
markdown het formaat. Dat is geen inconsistentie: het bezwaar gold het *bewerken* van
markdown, niet het *opslaan* ervan. Platte bestanden geven duurzaamheid, doorzoekbaarheid
met standaardgereedschap, en een noodluik als de app stukloopt.

**Overwogen:** HTML-bestanden in mappen. Volledige opmaakgetrouwheid, vooral bij plakken
uit Outlook. Afgevallen omdat je het markdown-ecosysteem verliest en de bestanden rauw
onleesbaar worden — precies de duurzaamheid die de reden was voor platte bestanden.

---

## B5 — Markdown plus een beetje inline HTML

**Genomen.** CommonMark + GFM, aangevuld met `<u>` voor onderstrepen en `==` voor
markeren.

**Waarom.** Markdown kent geen onderstrepen, geen markeren, geen tekstkleur. Onderstrepen
en markeren zitten wel in het dagelijkse Outlook-gebruik. Pure markdown zou dus
opmaakverlies betekenen bij elke geplakte mail.

Beide gekozen vormen tonen correct in Obsidian, wat B7 in stand houdt.

**Tekstkleur blijft er bewust buiten.** Dat is presentatie zonder betekenis, het maakt
bestanden onleesbaar, en het is niet in markdown uit te drukken zonder `<span
style>`-rommel.

---

## B6 — Eén pad naar markdown

**Genomen.** Typen, plakken en e-mail-import komen alle drie eerst uit op hetzelfde
ProseMirror-document. Alleen de serializer schrijft `.md`.

**Waarom.** Zodra er twee wegen naar markdown bestaan, drijven ze uit elkaar — dan
produceert een geplakte lijst subtiel andere inspringing dan een getypte, en breekt de
rondgang bij precies de constructies die het vaakst voorkomen. Eén pad, één testsuite.

**Gevolg dat het besluit rechtvaardigt:** de e-mail-import in fase 6 is bijna gratis,
want het is de plak-pijplijn uit fase 4 met een `.eml`-parser ervoor.

---

## B7 — Vault blijft Obsidian-compatibel

**Genomen.** Wikilinks (`[[Notitie]]`, `![[bestand.png]]`), YAML-frontmatter, een vaste
bijlagemap.

**Waarom.** Niet om Obsidian te gaan gebruiken, maar als noodluik: als de app stukloopt,
als er iets onderweg gelezen moet worden, als het project ooit doodbloedt — dan is er
standaardgereedschap dat de vault correct opent. Het kost vrijwel niets.

**Bijvangst:** wikilinks worden vault-breed op naam opgelost. Een notitie verplaatsen
naar een andere map breekt daardoor geen enkele afbeeldingsverwijzing. Met relatieve
markdown-links zou elke verplaatsing links moeten herschrijven.

---

## B8 — Bijlagen centraal, per jaar en maand

**Genomen.** `_attachments/JJJJ/MM/JJJJ-MM-DD-UUmm-naam.ext`, met alleen de bestandsnaam
als verwijzing in de notitie.

**Waarom.** Bijlagen naast de notitie zetten betekent dat verplaatsen twee bewegingen
wordt en dat je bij elke verplaatsing links moet herschrijven. Alles in één platte map
werkt tot een paar duizend bestanden en wordt dan onhandelbaar in Verkenner en Finder.
Jaar/maand houdt mappen hanteerbaar en maakt handmatig terugzoeken mogelijk.

De tijdstempel-prefix garandeert unieke namen, wat de voorwaarde is voor B7's
naam-gebaseerde oplossing.

---

## B9 — Index buiten de vault

**Genomen.** SQLite-index, instellingen en vensterstaat in de lokale app-map, niet in
OneDrive.

**Waarom.** Een SQLite-database die door OneDrive tussen twee machines wordt
gesynchroniseerd, wordt vroeg of laat een conflictkopie — en een half gesynchroniseerde
SQLite-database is een kapotte database. De index is bovendien herbouwbaar; er gaat niets
verloren.

Alleen `_templates/` en een zelden geschreven `config.json` staan wél in de vault, omdat
je die gedeeld wilt hebben.

---

## B10 — Nooit ongevraagd een bestand herschrijven

**Genomen.** Een notitie openen raakt het bestand niet aan. Geen herformattering, geen
`modified`-bijwerking, geen normalisatie. Schrijven gebeurt atomair, 800 ms na de laatste
toetsaanslag, en alleen als de inhoud werkelijk verschilt.

**Waarom.** Verreweg de meeste OneDrive-conflictkopieën ontstaan doordat een app
bestanden aanraakt die de gebruiker niet heeft gewijzigd. Als beide machines draaien en
allebei bij het openen normaliseren, botsen ze op notities die niemand heeft bewerkt.

Dit is de goedkoopste en effectiefste conflictpreventie die er is, en hij kost alleen
discipline.

---

## B11 — E-mail blijft, als vangnet en als ingang

**Genomen.** De e-mailroutine verdwijnt niet. Mail naar jezelf komt automatisch als
notitie in de Inbox.

**Waarom.** Niet uit nostalgie maar als bodem in de constructie. Als de app niet start,
of geblokkeerd wordt, of je zit op een vreemde machine — dan kun je nog steeds
vastleggen, en het komt goed terecht. Zonder die bodem is het project een alles-of-niets.

**Het contract is een map, niet een mechanisme.** Wie dan ook levert `.eml` of `.html`
af in `00 Inbox/_incoming/`. Daardoor is de leverancier vervangbaar zonder codewijziging.

---

## B12 — Power Automate boven een extern afvang-adres

**Genomen.** Voorkeur: Power Automate op de eigen mailbox. Terugval: Outlook-macro.
Laatste redmiddel: extern adres.

**Overwogen:** een echt Evernote-achtig afvang-adres (`notes@eigendomein.nl`) dat de Mac
Mini via IMAP leegtrekt. Dat is de mooiste variant in gebruik.

**Waarom niet als eerste keuze.** Werkmail zou dan door een externe mailbox lopen —
precies wat de keuze voor zakelijke OneDrive (B14) wilde vermijden. De inconsistentie
zou zijn: inhoud op OneDrive houden om binnen de werkomgeving te blijven, en diezelfde
inhoud via een privémailserver laten lopen.

Power Automate haalt hetzelfde resultaat zonder de tenant te verlaten, en zonder dat er
een machine aan hoeft te staan.

**Open punt:** of Power Automate beschikbaar is, moet nog worden nagekeken. Zie fase −1.

---

## B13 — Twee notitietypen, niet één en niet vijf

**Genomen.** *Snel* (datum/tijd + onderwerp) en *Vergadering* (+ locatie, aanwezigen,
bijlagen). Eén toets ertussen.

**Waarom.** Altijd het volledige kopblok tonen maakt "even een gedachte kwijt" te zwaar —
en dat is de handeling waarop de app moet winnen. Alleen datum/tijd maakt vergaderingen
juist te mager, terwijl aanwezigen precies is waar je later op wilt zoeken. Vijf
sjablonen is een keuzemoment bij elke notitie, en "te veel keuzes" was een van de
bezwaren tegen Obsidian.

Eigen sjablonen komen na v1, in `_templates/`, als de behoefte zich in de praktijk
aandient.

---

## B14 — Zakelijke OneDrive, geen server

**Genomen.** Vault op de zakelijke OneDrive, gesynchroniseerd op Windows en Mac. Geen
backend, geen account, geen dienst.

**Waarom.** Werkinhoud blijft binnen de werkomgeving — anders dan bij Evernote, dat
daarom niet op de werkmachine mag. Beide machines hebben de OneDrive-client al. Geen
server betekent geen beheer, geen kosten, geen aanvalsoppervlak, en niets dat kan
uitvallen.

**Prijs:** OneDrive kan conflictkopieën maken (aangepakt in B10), en Files On-Demand kan
lege placeholders opleveren (gecontroleerd bij eerste start).

---

## B15 — Geen agendakoppeling

**Genomen.** Onderwerp, locatie en aanwezigen worden met de hand ingevuld.

**Waarom.** Expliciete voorkeur: minder afhankelijkheid van de werkomgeving, en het
typen gaat sneller dan het corrigeren van een verkeerd voorgestelde afspraak. Op een
machine zonder admin is Outlook-toegang bovendien fragiel.

**Wel opengehouden:** de frontmatter-velden liggen vast, dus een latere koppeling kan
worden ingeplugd zonder dat bestaande notities veranderen. Aanvulling op eerder
ingevoerde namen komt wél in v1 — dat geeft het grootste deel van het gemak zonder de
afhankelijkheid.

---

## B16 — Volledige migratie, niet een schone start

**Genomen.** De hele map 'Notes to self' wordt eenmalig geïmporteerd naar
`90 Archive/Mail-import/JJJJ/`.

**Waarom.** Een lege app is een app die nog niets teruggeeft. Met de volledige
geschiedenis erin is zoeken vanaf dag één nuttiger dan Outlook-zoeken — en dat is precies
het punt waarop de app moet winnen om te blijven hangen.

De kosten zijn laag omdat het dezelfde code gebruikt als B6 en B11.

---

## B17 — ProseMirror rechtstreeks, geen TipTap

**Genomen** op 25 juli 2026, tijdens fase 2. De editor draait op ProseMirror zelf.

**Overwogen:** TipTap, zoals het technisch ontwerp oorspronkelijk voorschreef.

**Waarom niet.** TipTap bouwt zijn schema op uit extensies. Dat zou een *tweede*
schemadefinitie betekenen naast `src/markdown/schema.ts` — precies wat B6 verbiedt.
Twee definities drijven uit elkaar, en die afdrijving verschijnt als een notitie die
anders wordt opgeslagen dan hij is getypt. Ze in de pas houden kost blijvend werk en
een test die niets toevoegt behalve het bewaken van een probleem dat je ook gewoon niet
hoeft te hebben.

Daar komt bij dat de twee dingen waarvoor je TipTap zou willen — het lijstgedrag en de
Outlook-keymap — hier juist volledig eigen zijn. Van het standaardgedrag zou vrijwel
alles worden overschreven, dus de winst is klein en de laag eronder is dezelfde.

**Bijvangst:** minder in de renderer-bundel, en dat telt. Die bundel is de
belangrijkste kostenpost bij het opstarten, en op Windows is de latency krapper dan op
de Mac.

**Prijs:** wat TipTap kant-en-klaar levert — bubble menus, een tabel-extensie,
samenwerkingshooks — moet hier zelf. Voor tabellen betekent dat `prosemirror-tables`,
en dat komt pas in fase 4 aan de orde bij het plakken.

---

## B18 — Eén global shortcut, en niet op Ctrl+Shift+Space

**Genomen** op 26 juli 2026, na fase 3. De capture-hotkey is standaard `Ctrl+Shift+Y` /
`Cmd+Shift+Y`. De bibliotheek krijgt géén eigen global shortcut: die opent vanuit het
tray-menu en met `Mod+O` in het capture-venster.

**Waarom geen tweede global.** Een global shortcut is een claim op de hele machine: elke
andere app raakt die combinatie kwijt. Voor het capture-venster is dat de prijs waard —
dat is het hele punt van de app, en het gaat om tientallen keren per dag. Voor het
doorbladeren van de vault niet: dat is een bewuste, zeldzame handeling met twee ingangen
die niets kosten.

Het tray-menu adverteerde tot nu toe `Ctrl+Shift+E`. Een accelerator in een tray-menu
wordt echter getekend en nooit geregistreerd, en het applicatiemenu is teruggebracht tot
de klembordrollen — er werd dus niets geclaimd en er gebeurde ook niets. Het label is weg.

**Waarom niet langer Ctrl+Shift+Space.** Dat is in Word, en daarmee in Outlook waarin
gecomponeerd wordt, de harde spatie. Juist de app die vanuit Outlook wordt aangeroepen
moet Outlook niets afnemen.

**Afgewezen:** de hele familie `Ctrl+Alt+<letter>`. Op Windows is Ctrl+Alt gelijk aan
AltGr, dus op een Nederlandse of US-International-indeling typt `Ctrl+Alt+E` een `€`.
Verder `Cmd+Shift+A` (in Word: alles kapitalen), `Cmd+Shift+W` (botst met `Mod+W` in het
capture-venster zelf), `Cmd+Shift+Q` (uitloggen op macOS) en `Cmd+Shift+1…6`
(getalnotaties in Excel, koppen in de eigen editor).

**Prijs:** `Ctrl+Shift+Y` heeft geen mnemoniek. Dat is bewust ingeruild tegen stilte: het
is de enige kandidaat zonder botsing in Word, Outlook, Excel, Verkenner of de browsers.
Op macOS claimt alleen de systeemdienst 'Maak nieuwe notitie' hem, en die wordt hier
nooit gebruikt.

---

## B19 — Tags zijn tekst, geen bouwsteen

**Genomen** op 26 juli 2026, na fase 3. Een `#tag` in de body blijft gewone tekst. Er komt
géén tag-mark en géén tag-node in `src/markdown/schema.ts`. In ruil daarvoor krijgt de
serializer één uitzondering: een `#` aan het begin van een regel wordt niet ontsnapt
wanneer er onmiddellijk een tagnaam op volgt.

**Waarom geen bouwsteen in het schema.** Een tag is geen structuur maar een *lexicale*
eigenschap van gewone tekst — precies hoe Obsidian het ook modelleert, dat kent evenmin
een tag-node en scant gewoon. In het schema zetten kost een mdast-uitbreiding, een
scanner in `normalize-phrasing.ts`, een tak in `from-mdast.ts` en in `to-mdast.ts`, een
stringify-handler, `toDOM`/`parseDOM`, en een plek in `MARK_NESTING_ORDER`. Het verandert
bovendien de vorm van `CapturePayload.doc`, en dat is precies het contract waar het
plakwerk van fase 4 tegenaan geschreven gaat worden.

Het zou de rondgang ook niet béter maken maar slechter: een met de hand geschreven
`\#tag` zou door de scanner alsnog tot tag worden gepromoveerd en als levende `#tag`
worden teruggeschreven. Diezelfde beperking heeft de gekozen oplossing ook — maar zonder
de zes bestanden.

**Waarom de uitzondering op het ontsnappen dan wél moet.** `#` aan het begin van een regel
werd tot nu toe altijd `\#`, omdat daar een ATX-kop zou kunnen beginnen. Voor Obsidian is
`\#klantx` geen tag. Zonder de uitzondering zou de vault dus twee soorten tags bevatten —
die middenin een regel werken en die vooraan niet — zonder dat er iets zichtbaar is dat
het verschil verklaart. Dat botst frontaal met B7.

Het kan geen kwaad omdat CommonMark een kop alleen leest wanneer er een spatie, een tab
of het regeleinde op de hekjes volgt: `#klantx` op kolom 0 is hoe dan ook een alinea, dus
het leest identiek terug. `\# Dit is geen kop` houdt zijn backslash, want daar staat een
spatie achter het hekje.

**Gemeten voordat het besluit viel:** de wijziging is tegen het hele corpus gedraaid en
**geen van de 25 bestanden verandert**. Dat is wat het van een gok een besluit maakte.

**Prijs:** `03-markdown-dialect.md` §3.1 en §6 moesten worden bijgesteld — de zin "een `#`
in de tekst is dus altijd een echte kop" was niet meer waar. En er staat een beperking
bij in §9.

---

## B20 — Locatie en personen horen bij elke notitie, niet alleen bij een vergadering

**Genomen** op 28 juli 2026, na zes weken gebruik. `location` en `attendees` bestaan op
elke notitie en zijn zichtbaar in **beide** vensters. `type: meeting` blijft bestaan, maar
alleen nog als *etiket*: het bepaalt niet langer welke velden er zijn.

**Wat er verandert.** `saveNote` in `vault-io.ts` verwijderde beide velden zodra
`kind === "quick"`, en `buildFrontmatter` in `capture-store.ts` schreef ze alleen binnen
`if (kind === "meeting")`. Beide takken zijn weg. Het kopblok is één vaste vorm geworden —
Wanneer / Waar / Wie / Tags, altijd alle vier — in plaats van twee vormen.

**Waarom het de redenering in `HeaderBlock.tsx` omkeert.** Daar stond: "altijd het volle
blok tonen maakt 'even iets vastleggen' te zwaar, en dat is nu juist de handeling waarop
deze app moet winnen." Dat argument klopte op papier en niet in gebruik. Drie dingen
kwamen eruit:

- Waar en wie zijn óók op gewone notities gewild. "Even bijgepraat met Els bij de koffie"
  is geen vergadering en het is precies wat je een half jaar later terugzoekt op naam.
- De rij die verscheen en verdween liet het venster springen tijdens het typen. De vorm
  die "licht" moest voelen was juist de onrustige.
- Het poortje was wat `type` gevaarlijk maakte. Omdat terugzetten naar `quick` locatie en
  aanwezigen wíste, kon het leesvenster de schakelaar helemaal niet aanbieden — de veilige
  richting was de enige richting. Nu verandert hij één regel in het bestand, wat B10 wil.

**Wat het kost.** Het volle blok is meer eerste paint in het opnamevenster. Gemeten met
`--selftest=50` tegen dezelfde machine: hotkey → caret is ongewijzigd, wat klopt met de
architectuur — het venster is al gerenderd en de sneltoets doet niets dan `show()` en
focus.

**Prijs:** de docblock van `HeaderBlock.tsx`, de `HeaderBlock`-alinea in `CLAUDE.md` en
§3.2 van `01-functioneel-ontwerp.md` beschreven alle drie de twee vormen en zijn bijgesteld.
`03-markdown-dialect.md` §2 kon blijven staan: de specificatie stond elk optioneel veld op
elk type altijd al toe — de code was strenger dan het formaat. Er is één corpusbestand bij
voor de nieuwe toegestane vorm, `27-snelle-notitie-met-wie-en-waar.md`.

**Dit beantwoordt het open punt "Blijft het bij twee notitietypen?"** Ja, maar als etiket:
de twee typen overleven, de tweedeling in vélden niet.

---

## B21 — Van vault wisselen start de app opnieuw op

**Genomen** op 28 juli 2026. De instellingen tonen een lijst van eerder gebruikte
vaultlocaties. Er een kiezen schrijft `vaultPath`, vraagt om bevestiging, en doet dan
`app.relaunch(); app.quit()`. Er is geen wissel-tijdens-gebruik.

**Waarom niet live.** Niet uit voorzichtigheid maar omdat er vier stukken toestand zijn
die één keer worden bepaald en daarna nooit meer worden herzien. Alle vier nagelopen in
de code, niet aangenomen:

- `CaptureWriter.session.path` wordt bij de eerste schrijfactie vastgesteld en verandert
  daarna niet. Een half getypte notitie zou in de oude vault blijven landen.
- `ensureScanned` laat gelijktijdige aanroepers samenvallen op één `running`-belofte
  **zonder te kijken om welke vault het gaat**. Een `facets()` vlak na een wissel kan dus
  wachten op de scan van de oude vault en diens cache teruglezen. `invalidate()` bestaat
  en heeft nul aanroepers.
- Een lopende `saveTimer` in de renderer zou de bytes van de oude notitie in de nieuwe
  vault schrijven, op hetzelfde relatieve pad, waarbij `writeAtomic`'s `mkdirSync` de map
  aanmaakt om hem in te zetten. Zonder enige melding.
- `filesOnDemandWarned` was één globale boolean, dus een nieuwe on-demand vault zou de
  waarschuwing nooit meer tonen.

Alle vier zijn afzonderlijk op te lossen. Samen zijn ze een herontwerp van de
levensduur van vier modules, voor een handeling die een paar keer per jaar voorkomt en
waarvan de faalmodus "notities in de verkeerde vault" is. Herstarten kost twee seconden.

**Wat er wél is aangepast:** `filesOnDemandWarned` is een lijst van paden geworden, want
anders landt juist de herstart in een nieuwe vault met de waarschuwing permanent
onderdrukt. En bij `registerLibraryIpc` staat nu een zin die uitlegt dat het per aanroep
opzoeken van de vault géén belofte van live wisselen is — dat stond er als "zodat het
zonder herstart werkt", en dat is precies hoe iemand dit over een jaar verkeerd leest.

**Bare paden, labels afgeleid.** `vaults.json` bewaart alleen paden. Het label — *Gesynchroniseerd
— &lt;tenant&gt;*, *Lokale map*, *Niet beschikbaar* — wordt bij elke weergave opnieuw bepaald,
want een pad dat géén OneDrive-pad meer is (map verplaatst, tenant hernoemd, account
losgekoppeld) moet correct worden beschreven, en een bewaard label zou juist over dat
geval met stelligheid liegen. De prefixtest heeft een scheidingsteken-bewaking, anders
valt `OneDrive-Contoso-old` binnen `OneDrive-Contoso` en krijgt de vault de verkeerde
tenant te zien.

Niet-beschikbare vaults worden grijs getoond en niet verborgen: vlak na inloggen, vóórdat
OneDrive zijn mappen heeft aangekoppeld, is precies wanneer deze lijst wordt geraadpleegd.

De classificatie staat in een Electron-vrije `src/main/vaults.ts` die de kandidatenlijst
als parameter krijgt — dezelfde discipline als `vault-io.ts`. `remembered.ts` importeert
`app` en is daarmee ontestbaar, en deze lijst bepaalt waar notities terechtkomen.

**Val:** `loadSettings()` past `launch.vaultOverride` ná de merge toe. Een `--vault=`-run
of een zelftest mag dus nooit in de onthouden lijst belanden; onthouden gebeurt alleen
vanuit de expliciete handeling, in `adoptVault`.

---

## B22 — Toch een installer en een auto-updater, alleen op Windows anders dan verwacht

**Genomen** op 30 juli 2026. `02-technisch-ontwerp.md` §9 koos bewust tegen een installer:
"zonder admin is een installer alleen maar een extra hindernis." Dat argument klopt nog
steeds voor een *systeembrede* installer — maar niet voor een installer die, net als het
uitgepakte zip-mapje van nu, in het eigen gebruikersprofiel installeert. `electron-builder`'s
NSIS-doel met `perMachine: false` doet precies dat: geen adminrechten nodig, geen extra
stap tegenover unzippen-en-starten. Windows krijgt daarom een echte installer én een echte
auto-updater (`electron-updater`, in `src/main/updater.ts`), met twee expliciete
bevestigingen — vóór downloaden, nog eens vóór herstarten — zodat een achtergrondcontrole
nooit ongevraagd een sessie onderbreekt.

**macOS blijft zoals het was, met opzet.** Geen Developer ID, geen notarisatie — dat kost
geld en tijd voor een app van één gebruiker, en `electron-updater`'s stille installatiepad
op macOS (Squirrel.Mac) vereist echte code-signing om betrouwbaar te werken. In plaats
daarvan doet de mac-kant een kale versievergelijking tegen de laatste GitHub-release en
opent bij een nieuwere versie de releasepagina in de browser — dezelfde handeling als
vandaag (map vervangen), alleen met een seintje in plaats van zelf moeten onthouden om te
kijken. `mac.target` blijft `zip`, ad-hoc gesigneerd, ongewijzigd.

**De repository moet publiek zijn.** `electron-updater`'s GitHub-provider en de kale
`fetch` die de mac-kant doet tegen `api.github.com/repos/.../releases/latest` werken
allebei alleen ongeauthenticeerd. De repo was privé; die stap (GitHub-instellingen, niet iets wat de code
zelf doet) hoort hierbij en is onomkeerbaar voor de bestaande geschiedenis — een bewuste,
aparte beslissing van de gebruiker, niet iets wat dit besluit stilzwijgend meebrengt.

**Wat het kost.** `electron-updater` is de eerste "echte" runtime-dependency (naast een
toekomstige `better-sqlite3`) die niet door electron-vite gebundeld wordt — het doet
dynamische `require`s die dat niet overleven. `package.json`'s `dependencies` was leeg om
precies deze reden zichtbaar te houden; nu staat er iets in, bewust, met dezelfde
uitzondering die daar al voor `better-sqlite3` in fase 5 was voorzien. `electron-builder.yml`
sluit `node_modules` niet langer categorisch uit — electron-builder's eigen
dependency-walk pakt wat er in `dependencies` staat automatisch mee, inclusief de
transitieve boom, zonder dat die met de hand hoeft te worden opgesomd.

**Wat gelijk blijft.** Geen versietekstopmaak, geen releasenotes in de app, geen
"skip deze versie" — de "Later"-knop in de dialoog dekt dat al, per sessie. Geen
tag-automatisering: een release blijft `package.json`'s versie bijwerken,
`git tag vX.Y.Z`, `git push --tags`, precies zoals `v0.1.0` handmatig ging.
`.github/workflows/release.yml` bouwt en publiceert pas ná die tag, met dezelfde
`npm run typecheck && npm test && npm run build` als elke andere push.

---

## B23 — De vergadering verdwijnt uit de interface, `type:` blijft in het formaat

**Genomen** op 3 augustus 2026, na gebruik van de macOS-release. Er is geen
*Vergadering*-knop meer, in geen van beide vensters, en `Ctrl+Shift+G` is uit het
sneltoetsenregister. Wie een notitie als vergadering wil merken, zet er een tag op.

**Dit maakt B20 af.** B20 degradeerde `type: meeting` al tot etiket: het bepaalde niet
langer welke velden er zijn, en juist daardoor werd omzetten één regel in het bestand in
plaats van een destructieve handeling. Wat B20 openliet was de vraag waarom dat etiket dan
nog een eigen knop verdient naast een tagveld dat er vlak naast staat en hetzelfde werk
doet — beter, want er is meer dan één soort notitie die je wilt terugvinden. Twee
mechanismen voor één handeling is er één te veel; de tag wint omdat hij algemeen is.

**Wat er níet verandert, en dat is het hele punt.** `type:` blijft een verplicht
frontmatterveld, `NoteType` houdt beide waarden, de zeven corpusbestanden met
`type: meeting` zijn ongemoeid, een bestaande vergadernotitie leest en bewaart bytegelijk,
en `type:meeting` blijft werken in de zoekbalk. Alleen de knop, de sneltoets, de
CSS en de vier vertaalsleutels zijn weg; de hele `NoteKind`-doorvoer van renderer naar
`saveNote` staat er nog en geeft door wat er al stond.

**Verworpen: `type:` uit het formaat slopen.** Dat zag er verleidelijk consequent uit —
een workflow die weg is heeft geen veld nodig — maar het betekent dat de eerste de beste
bewaaractie van een bestaande vergadernotitie stilzwijgend zijn frontmatter herschrijft.
Dat is B10 ("een notitie openen raakt het bestand niet") van de verkeerde kant benaderd en
het breekt B7: `type:` staat in `03-markdown-dialect.md` §2 als verplicht veld, en de
vault moet leesbaar blijven zoals hij is. Een veld dat niemand meer zet maar dat wel
overleeft kost niets; een vault die onder je handen verandert kost vertrouwen.

**Prijs:** de `HeaderBlock`-alinea in `CLAUDE.md`, §3.2 en §4 van
`01-functioneel-ontwerp.md`. `02-technisch-ontwerp.md` §7 blijft staan waar het het
*formaat* beschrijft — `type: meeting  # quick | meeting` is nog steeds waar.

---

## B24 — De prullenbak kan geleegd worden, definitief, maar alleen met de hand

**Genomen** op 3 augustus 2026. Tot nu toe verwijderde de app nooit iets: elke
verwijdering was een `rename` naar `_trash` en die map groeide voor altijd door. Dat was
geen beleid maar de afwezigheid ervan — de vraag "wat is eigenlijk het beleid voor het
legen van de prullenbak?" had als eerlijke antwoord "er is er geen." Nu staat er op de
notitielijst van de prullenbak, op de plek van *Nieuwe notitie*, een knop **Prullenbak
legen**, met een bevestiging die zegt hoeveel notities het betreft en dat het niet terug
te draaien is.

**Dit is de eerste definitieve verwijdering die de app doet**, en daarom staat er een
grendel omheen die niets met de interface te maken heeft: `emptyTrash` in `vault-io.ts`
controleert via `realpathSync` dat wat het weggooit werkelijk `<vault>/_trash` is en
binnen de vault ligt. `resolve()` alleen zou een `_trash` die een symlink naar elders
blijkt te zijn gewoon volgen.

**Verworpen: automatisch opruimen na dertig dagen.** Dat is precies het soort stille
destructieve handeling waar deze app zich de hele tijd verre van houdt — schrijven gebeurt
alleen bij echt verschillende bytes, openen raakt het bestand niet, een verwijdering is
een verplaatsing. Een opruiming die zonder aanleiding afgaat past daar niet bij, en het is
ook niet nodig: een map die je zelf leegt als hij je opvalt is geen probleem.

**Verworpen: `shell.trashItem` naar de systeemprullenbak** als extra vangnet. Een
OneDrive-bestand in de Windows-prullenbak wordt niet gesynchroniseerd — dat is precies de
reden dat `_trash` bestaat. Het zou het bestand op de andere machine weghalen zonder weg
terug, en dus het tegenovergestelde van een vangnet zijn.

**Wat gelijk blijft:** verwijderen zelf blijft nooit definitief. De acceptatie-eis
"verwijderen naar prullenbak, nooit definitief" in `04-bouwplan.md` fase 3 gaat over die
handeling en staat overeind; legen is een aparte, uitdrukkelijke tweede handeling.

---

## B25 — Cmd+Q sluit een venster, het beëindigt de app niet

**Genomen** op 3 augustus 2026. `installMinimalMenu` verving Electron's standaardmenu door
alleen de Edit-rollen en gaf de Quit-rol nooit terug, dus op macOS deed Cmd+Q helemaal
niets. Het menu heeft nu een echte applicatie-submenu — maar met een eigen
klikafhandeling in plaats van `{ role: "quit" }`: vanuit het bibliotheekvenster sluit
Cmd+Q dát venster, vanuit het notitievenster bewaart het de notitie en legt het venster
weg. **Het residente proces blijft in beide gevallen draaien.**

**Waarom niet gewoon de Quit-rol.** Omdat het proces residentie *is* de architectuur.
B2/B3: de koude start wordt één keer per dag betaald, bij het inloggen, en dat is wat de
keuze voor Electron verdedigbaar maakt. Een toetsaanslag die in elke andere app "sluit dit
venster" betekent, mag hier niet de sneltoets voor de rest van de dag onbruikbaar maken.
Het tray-item *Quit emqnote* blijft de enige echte uitgang, en dat is een bewuste keuze
en geen omissie.

**De afwijking staat op zijn kop in het menu, en dat is bekend.** Het item heet nog steeds
"Quit emqnote" en zit op de standaardplek met de standaardsneltoets, terwijl het het
proces niet beëindigt. Dat is de prijs voor spiergeheugen: wie Cmd+Q drukt wil dit venster
weg, niet de hotkey kwijt. Wie de app werkelijk wil stoppen doet dat waar dat altijd al
kon.

**Wat hier bij hoorde.** Hetzelfde onderzoek legde bloot dat het capture-venster helemaal
geen `close`-afhandeling had: op macOS zijn de stoplichten echt, dus de rode knop
vernietigde het venster. De module houdt precies één `BrowserWindow` vast, dus daarna
faalde `reveal()` voorgoed op `isDestroyed()` (hotkey en *Nieuwe notitie* dood) en liep
`writer.finish()` nooit, zodat de geladen notitie voor altijd geclaimd bleef — "open ter
bewerking" in een venster dat niet meer bestond. Sluiten verbergt nu, net als
`IPC.captureClose` al deed, met een `before-quit`-vlag zodat een echte afsluiting niet
blijft hangen op de `preventDefault()`.

---

## B26 — Taken zijn een eigen weergave, en hun status staat in de index

**Genomen** op 5 augustus 2026. Het formaat kent afvinkbare taken sinds het begin, maar er
was geen manier om te zien wat er in een project nog openstaat zonder elke notitie
afzonderlijk te openen. *Taken* is nu een vierde soort `Selection`, bereikbaar onderaan de
mappenboom naast *Verweesde bijlagen*: standaard de hele vault, met een mapfilter erin.

**Waarom een eigen weergave en niet een lens op de huidige map.** Een taak hoort bij een
notitie, en die notitie wil je ernaast kunnen lezen. Als *Taken* een schakelaar boven de
notitielijst was geweest, was het een derde ding dat om diezelfde kolom vecht — nu staat de
takenlijst in die kolom en blijft het leesvenster ernaast staan. Een volledig scherm
erboven, zoals het opruimscherm voor bijlagen, kon om precies dezelfde reden niet.

**Waarom de status in de index staat en niet bij het stellen van de vraag wordt gelezen.**
`checked` is een attribuut op een `listItem`-knoop, geen tekst. `plainText()` laat het dus
vallen, de FTS-tabel weet niets van taken, en geen enkele bestaande kolom kan de vraag
beantwoorden. Blijft over: bij het openen van de weergave de hele deelboom opnieuw
ontleden — en dat is precies de wandeling die op een vault van 4000 notities gemeten werd
op 470–535 ms blokkade van de hoofdthread. Dat is wat de scan naar een worker heeft
gedreven; het langs de achterdeur terughalen is geen optie. Er is daarom een `note_tasks`-
tabel, gevuld door `buildRecord`, die de volledige scan en de watcher toch al deelden.

**De prijs is een herbouw van de index.** Een bestaande index krijgt die rijen nooit
vanzelf: `needsRefresh` kijkt naar `mtime`+`size` en slaat een ongewijzigd bestand over.
`migrate()` houdt daarom een `PRAGMA user_version` bij en gooit de tabellen weg bij een
verhoging. Dat mag, en juist dáárom staat de index buiten de vault (B9): het is een
afgeleide cache, geen bron. Er gaat niets verloren, het kost één scan, en de voortgangsbalk
dekt die al.

**Afvinken gaat door de serializer, en controleert eerst.** `toggleTask` leest het bestand
opnieuw, ontleedt het, loopt naar het n-de taakitem, **controleert dat de tekst nog steeds
klopt** en weigert anders. Een indexrij kan achterlopen op de schijf, en het verkeerde
regeltje omzetten in een bestand dat de gebruiker niet voor zich heeft is het ene
faalgeval dat het waard is om tegen te ontwerpen. Daarna `serializeNote` en `writeAtomic`,
nooit in de buurt van de tekst — B6 geldt hier net zo goed.

---

## B27 — Een map verwijderen is een verhuizing naar de prullenbak

**Genomen** op 5 augustus 2026. Mappen konden gemaakt en hernoemd worden, maar nooit weg.
*Map verwijderen* hernoemt de map naar `_trash`, precies zoals een notitie dat doet, achter
een bevestiging die het aantal notities en submappen noemt dat meegaat.

**Waarom niet definitief verwijderen.** B24 heeft `emptyTrash` bewust tot de enige plek in
de app gemaakt die werkelijk iets vernietigt, en die staat achter een eigen bevestiging die
het aantal noemt en zegt dat het niet ongedaan te maken is. Een tweede onomkeerbare knop
ernaast zetten haalt dat onderscheid weg — zeker een die niet één notitie maar een hele
boom raakt.

**Waarom niet "alleen als hij leeg is".** Dat is geen waarschuwing maar een weigering, en
het verplaatst het werk naar de gebruiker: eerst twaalf notities ergens anders heen, dan
pas de map weg. De vraag die gesteld werd was een waarschuwing bij een niet-lege map, niet
een verbod erop.

**De weigeringen zijn die van `renameFolder`.** Dezelfde `FOLDER_ERROR`-codes, dezelfde
volgorde: de wortel niet, de eigen mappen van de app niet, niets dat buiten de vault
uitkomt, en niets dat er niet meer is. Twee operaties met dezelfde gevaren horen dezelfde
antwoorden te geven, en het is wat de renderer toelaat beide door één `folderErrorOf` te
halen. Daar bovenop weigert de IPC-laag een map waarin het opnamevenster een notitie
geclaimd heeft — hetzelfde gevaar als bij `libraryMoveNote`, een niveau hoger.

---

## B28 — Bijlagen komen er via één weg in, en worden geserveerd via een eigen protocol

**Genomen** op 5 augustus 2026. Plakken, slepen en de bestandskiezer landen alle drie op
één `insertAttachment`. Het bestand gaat naar `_attachments/` onder de naam
`YYYY-MM-DD-HHmm-<slug>.ext` die de corpusbestanden al gebruikten; een afbeelding wordt
`![[…]]` en staat in de editor als de afbeelding zelf, al het andere wordt `[[…]]` en staat
er als een label dat in de systeemviewer opent.

**Dit bestond nog niet.** `orphaned-attachments.ts` kon een bijlage al opruimen en het
dialect kon er al naar verwijzen, maar geen enkele regel code kon er één *maken* — een
bijlage kwam de vault alleen binnen door hem met de hand in de map te zetten.

**Waarom een eigen protocol en geen `data:`-URL.** Het opruimscherm gebruikt er één voor
zijn miniatuur, en dat mag daar blijven: één bestand, één keer. In een notitie met drie
schermafdrukken zou het betekenen dat elke afbeelding een derde groter door de IPC gaat en
bij elke render opnieuw. `emqnote-attachment://` leest van schijf, en `resolveAttachment`
weigert alles wat via `realpathSync` buiten `_attachments/` uitkomt — het volgen van
symlinks *is* de bewaking, dezelfde redenering als bij `emptyTrash`. Beide vensters kregen
`emqnote-attachment:` in hun CSP; het opnamevenster had er nog helemaal geen `img-src`.

**Plakken claimt alleen afbeeldingen.** `handlePaste` geeft alles wat geen afbeelding is
onaangeroerd door aan de bestaande route. Het plakwerk uit Outlook (§6.3) is uitgesteld en
niet vergeten, en dit mag het niet vóór de voeten lopen of ingewikkelder maken.

**De `attachments:`-frontmatter wordt niet bijgewerkt.** `saveNote` beheert dat veld niet,
en het wél bijwerken zou betekenen dat het invoegen van één afbeelding de kop van de
notitie herschrijft. Dat is B10 van de andere kant benaderd, en hetzelfde bezwaar dat
`summarise` ervan weerhoudt tags uit de tekst naar de frontmatter te kopiëren. De verwijzing
in de tekst is wat `collectWikiTargets` leest, en dat is genoeg.

---

## B29 — Een nieuwe notitie belandt waar je staat, de sneltoets houdt de Inbox

**Genomen** op 6 augustus 2026, uit dagelijks gebruik. `+ Nieuwe notitie` in de bibliotheek
geeft de geselecteerde map mee; het opnamevenster schrijft de notitie daar. De wortel van
de vault (`""`) hoort daarbij: die kon je aanklikken en doorbladeren, maar er was geen
enkele regel code die er een bestand in kon zetten.

**De sneltoets en het systeemvak veranderen niet.** Die weten niet waar je staat — er is
geen venster met een selectie — en de Inbox is precies het antwoord op "ik weet nog niet
waar dit hoort". Dat is de hele reden dat die map bestaat. Ze sturen dus geen map mee en
`beginSession` blijft op `INBOX` staan.

**De map wordt gekeurd, niet vertrouwd.** `newNoteFolder` weigert alles wat absoluut is,
alles wat met `..` omhoog klimt en de prullenbak, en valt terug op de Inbox in plaats van
te weigeren: een getypte notitie moet érgens landen. De boom biedt alleen echte mappen
aan, dus dit gaat niet over het eerlijke geval — het gaat erover dat een string die over
de IPC binnenkomt beslist waar het proces een bestand neerzet.

**Alleen zolang de notitie nog geen bestand heeft.** `writeSession` kiest het pad bij de
eerste schrijfbeurt en nooit meer daarna (B10 leunt daarop), dus `newNoteIn` weigert zodra
`session.path` gezet is of de sessie bij een bestaande notitie hoort. Anders zouden deze
kant en de schijf het oneens worden over waar de notitie staat.

**Verplaatsen laat de boom staan waar hij stond.** Hetzelfde gebruik, andere kant op: een
Inbox leegmaken is één notitie na de andere uit dezelfde map halen, en meespringen naar
elke bestemming betekende na élke verplaatsing terugklikken. De notitie zelf blijft open in
de lezer, onder haar nieuwe pad, dus de verplaatsing is nog steeds zichtbaar bevestigd —
ze staat alleen niet meer in de lijst links, en dat ís wat verplaatsen betekent.

---

## B30 — De PDF-miniatuur komt van het besturingssysteem, niet uit een gebundelde bibliotheek

> **Herroepen door B36** op 7 augustus 2026: de app tekent de eerste pagina nu zelf met
> pdf.js. Wat hieronder staat blijft gelden voor de vorm van de miniatuur, de cache en de
> terugval op de labelchip — alleen de bron van de afbeelding is veranderd.

**Genomen** op 7 augustus 2026. Een bijlage van het formaat `.pdf`, `.docx`, `.xlsx` of
`.pptx` krijgt een miniatuur van zijn eerste pagina naast de bestaande labelchip, via
`nativeImage.createThumbnailFromPath` — dezelfde aanroep die op macOS Quick Look en op
Windows de geregistreerde `IThumbnailProvider` aanspreekt, precies de twee platformen die
dit project uitlevert. Geen nieuwe dependency, geen offscreen venster, geen worker.

**Waarom niet `pdfjs-dist`.** Een gebundelde PDF-bibliotheek is ~1,5 MB plus een eigen
worker, in een venster (`02-technisch-ontwerp.md`) waarvan de bundelgrootte al bewust
klein wordt gehouden omdat het venster meteen moet verschijnen. Dat gewicht dragen voor
een miniatuur van 96×124 is de verkeerde ruil.

**Waarom niet een verborgen `BrowserWindow` met `capturePage`.** Dat stapelt drie dingen
die geen van alle gegarandeerd zijn — plugin-engagement op een eigen protocol, echte
pixels van een venster dat nooit getoond wordt, het bijsnijden van chrome die er niet
hoort te zijn — bovenop een proces waarvan de hele opzet één residente, verborgen
opnamevenster is (zie "Resident architecture" in `CLAUDE.md`). Een tweede, onzichtbaar
venster erbij zou precies dat uitgangspunt ondermijnen voor een miniatuur.

**Eigen protocol, geen `data:`-URL — dezelfde reden als B28.** `wikiLinkNodeView` wordt
bij elke `setDoc` opnieuw opgebouwd, dus bij elk openen van een notitie; een IPC-rondje
dat een base64-PNG teruggeeft zou dat bij elke opening opnieuw betalen, en zou `data:`
terug moeten toevoegen aan de `img-src` van het opnamevenster's CSP — precies het gat dat B28
dichtte. In plaats daarvan is het `<img>`-element zelf de state machine:
`emqnote-thumb://<naam>` als `src`, `onload` zet `data-thumb="ok"` op de omringende span,
`onerror` verwijdert het element en laat de oorspronkelijke labelchip staan — geen IPC-
rondje, geen "vraag main, wacht, zet dan pas src".

**De cache staat buiten de vault (B9).** `<userData>/thumbnails`, naast `index.sqlite`.
Sleutel is `sha256(echt-pad + "\0" + mtimeMs + "\0" + grootte)`, afgekapt tot 32 hex-
tekens — het echte, opgeloste pad, niet de kale bestandsnaam, want twee verschillende
vaults kunnen allebei een bijlage met dezelfde naam hebben. `mtime`+`grootte` is dezelfde
staleness-toets die `index-db.ts`'s `needsRefresh` al gebruikt, dus een gewijzigd bestand
levert vanzelf een andere sleutel op — er is geen aparte invalidatie nodig. Ruiming is
lui en gebeurt alleen tijdens het genereren van een nieuwe miniatuur, nooit bij het
opstarten: bij meer dan 200 bestanden verdwijnt het oudste (naar `mtime`) eerst.

**Negatief cachen blijft in het geheugen.** Een mislukte generatie — geen provider
geregistreerd, een kapot bestand — hoeft niet bij elke render van dezelfde notitie
opnieuw geprobeerd te worden, maar hoort ook niet permanent op schijf te blijven staan:
de volgende sessie, op een andere machine of na een OS-update, kan de provider wél
werken. Zowel main (`thumbnails.ts`, per sleutel) als de renderer
(`attachment-view.ts`, per doelnaam, want NodeViews weten niets van `mtime`/`grootte`)
houden hiervoor een eigen, begrensde `Map` bij, alleen voor de duur van het proces.

**Op Linux — deze sandbox, en CI — bestaat er geen thumbnail-provider.** Electrons
eigen documentatie beperkt `createThumbnailFromPath` tot `darwin`/`win32`; op Linux komt
er geen fout maar een lege `NativeImage` terug (op Windows zonder provider evenzeer), en
`.isEmpty()` is wat dat van een echte hit onderscheidt. Dat betekent dat de terugval-weg
— de gewone labelchip, ongewijzigd — de enige weg is die hier ooit getest wordt; de
echte miniatuur is nooit gezien werken en staat daarom als een nieuw item in
`TEST-PROTOCOL.md`, niet als een geverifieerde bewering hier.

**Een OneDrive-placeholder wordt niet gehydrateerd voor een miniatuur.** Files On-Demand
laat een niet-gedownload bestand achter met een reële grootte maar nul blokken op
schijf — dezelfde toets die `vault.ts`'s `checkFilesOnDemand` gebruikt om de hele vault
te bemonsteren, hier toegepast op het ene bestand dat gevraagd wordt. `darwin`-only,
net als `index-scan.ts`'s `isDataless`: dat is het enige platform waarop `blocks` dit
betrouwbaar betekent.

## B31 — Een wijziging buiten de app wordt getoond, nooit stilzwijgend overgenomen of overschreven

**Genomen** op 7 augustus 2026. De index merkte een bestand dat buiten de app verdween of
veranderde altijd al op (`deleteNote` op een `unlink`), maar het venster dat de notitie
open had staan, wist er niets van: de lezer bleef de oude inhoud tonen en de eerstvolgende
gedebouncede autosave **herschiep een verwijderd bestand**. Dat is nu opgelost door het
open venster zelf te laten kiezen, in plaats van iets automatisch te doen dat niet terug
te draaien is.

**Een inhoudshash, geen tijdvenster, om de eigen schrijfactie van de app te herkennen.**
Zonder dat zou de balk 800 ms na elke stopgezette toetsaanslag verschijnen — de eigen
gedebouncede autosave is zelf een schrijfactie die de watcher ziet. Een tijdvenster ("negeer
schrijfacties gedurende N ms na onze eigen save") is bewust afgewezen: dat maakt van een
correctheidseigenschap een timingeigenschap, en de ene klok die deze app niet kan
vertrouwen is die van OneDrive — het herschrijft een bestand na het uploaden op zijn eigen
schema, niet op een schema dat deze app regelt. `own-writes.ts` onthoudt in plaats daarvan
`sha256(inhoud)` per pad, begrensd tot 64 items; een externe wijziging die toevallig exact
dezelfde bytes herstelt telt ook niet als nieuws, en dat is geen speciaal geval maar de hash
die precies doet wat hij moet doen.

**De bibliotheek en het opnamevenster kiezen allebei anders, met opzet.** De bibliotheek
krijgt elke gebeurtenis en filtert zelf tegen wat de lezer op dat moment open heeft staan —
main heeft daar geen betrouwbaar zicht op, en dat erbij bouwen zou een tweede bron van
waarheid worden voor iets de renderer al bezit. Het opnamevenster wordt wél in main
gefilterd, tegen `writer.activePath()`, want dat pad ís main's eigen staat. Bij een
schone notitie (`!dirty`) laadt de bibliotheek stilzwijgend opnieuw — er is niets te
verliezen; bij een notitie met eigen, nog niet opgeslagen tekst verschijnt een balk met
**Reload** en **Behoud de mijne**. Bij een verwijdering verschijnt altijd een balk
(**Sluiten** / **Behoud de mijne**), zelfs als de notitie schoon is — een verwijdering
sluit nooit vanzelf, want dat rukt een venster weg dat iemand op dat moment aan het lezen
kan zijn, en een voorbijgaande OneDrive-hik (verwijderen-en-herstellen tijdens
conflictoplossing) mag dat niet stilzwijgend kunnen doen. Het opnamevenster kent geen
`dirty`-status van main — het venster houdt zelf een `dirtyRef` bij, met opzet
te-voorzichtig ingesteld (het weet niet zeker of main de laatste bytes al duurzaam
wegschreef), en toont bij twijfel liever een overbodige melding dan dat het ooit iets
wegvaagt dat iemand aan het typen is.

**`unlinkDir` kreeg alsnog een handler.** Chokidar garandeert geen `unlink` per bestand
bij het verwijderen van een hele map — zonder deze wijziging bleef een buiten de app
verwijderde map met al zijn notities gewoon in de index staan: nog steeds zichtbaar, nog
steeds doorzoekbaar, nog steeds meegeteld in Taken. `deleteNotesUnder` matcht op
`substr(pad, 1, lengte) = voorvoegsel + "/"`, bewust niet met `LIKE` (`_` is daar een
jokerteken dat een echte onderstrepingsmap zou laten meematchen) of `GLOB` (`[` is een
metateken dat een mapnaam legitiem kan bevatten).

**Bevestigd in de echte app onder `Xvfb`, over CDP aangestuurd — het hele pad in de
bibliotheek.** Een bestand extern bewerken terwijl de notitie schoon is: stille herlaad,
geen balk. Extern bewerken terwijl er eigen tekst nog niet is opgeslagen: de balk
verschijnt met **Reload** en **Behoud de mijne**, en de zojuist getypte tekst blijft
onaangeroerd staan tot er gekozen wordt. Extern verwijderen: de balk met **Sluiten** /
**Behoud de mijne** verschijnt en de notitie sluit niet vanzelf. Een minuut lang doorlopend
typen in de bibliotheek leverde geen enkele valse balk op — de eigen-schrijfactie-
onderdrukking hield precies stand. De eigen, knopvrije melding van het opnamevenster is
nog niet op deze manier gezien; zie `TEST-PROTOCOL.md`.

## B32 — Geen functietoetsen in sneltoetsen

**Genomen** op 7 augustus 2026. `F1` (help), `F6` (`cyclePanes`) en `Shift-F10`
(`contextMenu`) zijn vervangen, alle drie om dezelfde reden: op een MacBook-toetsenbord
zitten functietoetsen achter `fn` — een dagelijkse sneltoets die daarachter verstopt zit,
is geen sneltoets meer maar een hindernis. `Mod-/` bestond al als alias voor help en werd
de enige vorm; `cyclePanes` kreeg `Ctrl-Tab`/`Ctrl-Shift-Tab`, de vorm die de browser zelf
al gebruikt om tussen tabbladen te wisselen en waar `keymap.ts` geen binding voor heeft,
dus hij bereikt nog steeds elk paneel inclusief het opnamevenster; `contextMenu` kreeg
`Mod-Shift-M`, en `outdent` — de enige andere plek die dat akkoord claimde, als alias
naast `Shift-Tab` — gaf die claim op zodat één sneltoetstabel niet twee dingen tegelijk
kon beweren.

**Afgewezen: Shift-F10 laten staan omdat het de Windows-toegankelijkheidsstandaard is.**
Dat is waar — Shift-F10 is op Windows de systeembrede conventie voor "contextmenu openen"
— maar deze app draait op twee platformen met precies dezelfde toetsenbordindeling voor
elke andere sneltoets in `shortcuts.ts`, en een uitzondering die alleen op Windows werkt
zou de ene plek zijn waar `Mod`'s belofte (één binding, beide platformen) niet opgaat.
`ContextMenu` — de eigen toets die alleen op een Windows-toetsenbord bestaat en geen `fn`
nodig heeft — blijft wel staan, precies om die Windows-conventie te bedienen zonder de
fn-eis van een functietoets.

## B33 — Een weblink open je met Mod+klik, alleen http(s), en main beslist

**Genomen** op 7 augustus 2026. Een link in een notitie kon wel getypt en geplakt worden,
maar nergens geopend — de mark bestond al (`schema.ts:233-254`), rondde correct door de
markdown-rondtrip en stond zelfs in de corpus-specificatie, maar er was geen enkel gebaar
dat hem opende. Een gewone klik moet de cursor blijven plaatsen — de linktekst is gewone,
bewerkbare tekst, en een klik die in plaats daarvan probeerde te navigeren zou een typefout
erin onherstelbaar maken. Daarom is gekozen voor Mod+klik: Cmd op macOS, Ctrl op Windows,
hetzelfde gebaar dat elke browser al gebruikt voor "open in een nieuw tabblad".

De schemabeslissing wordt opnieuw gemaakt in main (`isOpenableUrl`, `src/main/remote-image.ts`)
en nooit vertrouwd vanuit de renderer — dezelfde redenering die de toelaatlijst van de
plakpijplijn al documenteert voor zijn eigen schema's: de renderer meldt alleen waar
geklikt is en welke href de mark draagt, main beslist wat daarmee mag gebeuren. Alleen
`http:` en `https:` zijn toegestaan, dezelfde lijst als `isFollowableUrl` voor een
omleiding — `data:` heeft niets te "openen", en `file:` zou een link in een notitie iets
op de lokale schijf kunnen laten openen. Een afwijzing wordt gelogd en verder niets: er is
geen bestand dat half geschreven kan zijn, dus niets om terug te draaien.

**`toDOM` van de linkmark bleef onaangeroerd.** De verleiding was groot om de href als
`title`-attribuut te schrijven zodat zweven de bestemming al toont, maar diezelfde
`toDOM` is ook wat `_serializeForClipboard` gebruikt om de HTML op het klembord te
zetten — een link zonder eigen titel kopiëren en terugplakken, zelfs binnen dezelfde
notitie, zou dan een titel krijgen die er nooit was: een echte, opgeslagen wijziging bij
de eerstvolgende save, niet alleen een weergaveverschil. `link-title.ts` toont de href in
plaats daarvan als een decoratie — dezelfde soort die `tag-decoration.ts` al gebruikt voor
`#tag`-kleuring — die nooit meegaat in wat gekopieerd of geserialiseerd wordt.

## B34 — Een taak plakken in een lijst van taken is een handmatige invoeging, nooit `replaceSelection`

**Genomen** op 7 augustus 2026. Gemeld als: het vinkje van de taak náást de zojuist
geplakte taak klapt om — aangevinkt wordt leeg, of andersom. `listItem` is
`defining: true` (`schema.ts:130`) — dat is wat een alinea of een geneste lijst onder een
bullet laat hangen zonder dat ProseMirror probeert onverwante structuur eroverheen samen
te voegen. `prosemirror-transform`'s `replaceRange`, wat `EditorState#tr.replaceSelection`
gebruikt zodra een geplakte slice niet triviaal past, leest precies die vlag om te
beslissen wanneer terug te deinzen en de omringende grens opnieuw op te bouwen. `checked`
is maar een attribuut, maar die terugdeins-logica vergelijkt de hele node-markup
(`sameMarkup`), dus een geplakt item met een ander vinkje dan het item waar het in landt,
raakt hetzelfde pad als een werkelijk ander bloktype. De herbouw hergebruikt daarbij één
node-identiteit voor zowel de onaangeroerde helft van het doelitem als het vers geplakte
item — waardoor geen van beide vinkjes meer klopt.

Bevestigd met een op de geserialiseerde markdown afgedwongen assertie
(`test/paste-task-list.test.ts`), niet aangenomen: dat is ook precies wat het
documentniveau-scenario onderscheidt van het render-niveau-scenario dat er eerst evengoed
verdacht uitzag (`checkbox.ts`'s widget-sleutel, gedeeld door elk item in dezelfde staat) —
er komt bij het echte scenario geen enkele view aan te pas. `paste-list-item.ts` claimt in
`handlePaste` precies deze ene, nauw omschreven vorm — een losse cursor binnen een
lijstitem, een slice die zuiver uit hele lijstitems bestaat, met minstens één vinkje dat
afwijkt van het item waar geplakt wordt — en voert de invoeging met de hand uit: splits
het doelitem op de cursor (dat behoudt, anders dan het generieke pad, dezelfde
node-identiteit — en dus hetzelfde vinkje — op beide helften, precies zoals Enter dat zou
doen) en voeg de geplakte items, onaangeroerd, in op de naad die dat net geopend heeft.
Elke andere plakvorm, inclusief een echte tekstselectie die door geplakte inhoud vervangen
wordt, blijft het bestaande pad volgen — dat handelt dat geval al goed af.

---

## B35 — Een notitieverwijzing bewaart het pad, toont de alias, en verhuist mee

**Genomen** op 8 augustus 2026. `[[Notitie]]` stond al in het dialect en rondde al correct
door de serializer, maar er gebeurde niets als je erop klikte: `wikiLinkNodeView` riep
`openAttachment` aan, en een notitie ligt niet in `_attachments/`, dus het antwoord was
stilzwijgend niets. Drie beslissingen samen maken er een werkende verwijzing van.

**Het doel is een pad, de alias is wat je leest.** De app schrijft
`[[01 Projecten/2026-08-05 1030 Spelregels|Spelregels]]`. Alleen een titel opslaan was het
alternatief en is afgewezen om precies de reden die de gebruiker zelf noemde: een vault mág
twee notities met dezelfde titel bevatten, zolang ze niet in dezelfde map staan — en dan is
de titel geen adres meer. Het pad wél. Andersom is een pad niets om naar te kijken midden in
een zin, dus staat de alias ernaast; hij is wat het scherm toont.

**Een kale `[[Titel]]` blijft geldig.** Zo schrijft Obsidian het en zo typt een mens het, en
B7 verbiedt een vault die alleen door deze app te lezen is. `link-resolve.ts` probeert
daarom drie regels op volgorde: pad (hoofdlettergevoelig — machinaal geschreven), titel en
tot slot bestandsnaam (allebei hoofdletterongevoelig — met de hand getypt). **Een regel die
raak is, valt niet door naar de volgende, ook niet als hij meerdere notities raakt.** Dat
onderscheid tussen "meerdig" en "niets gevonden" is het hele punt: bij twee notities die
werkelijk `Spelregels` heten, zou doorvallen naar de bestandsnaamregel een *derde* notitie
kiezen. Meerduidigheid is een vraag aan de gebruiker (`LinkPicker.tsx`), niet iets om
harder proberend op te lossen.

**Verhuist de notitie, dan verhuizen de verwijzingen mee — na een vraag.** `note_links` in
de index (`SCHEMA_VERSION` 1 → 2, met het tabellen-droppen dat B26 beschrijft) weet welke
notitie waarheen wijst; `linkingNotes` lost die hele tabel op tegen één opgebouwde index en
houdt over wat werkelijk naar déze notitie wijst. Verplaatsen of hernoemen vraagt dan "2
notities verwijzen hiernaar — meeverhuizen?" en `rewriteWikiLinks` doet het via
`parseNote` → muteren → `serializeNote` → `writeAtomic`, nooit via een tekstvervanging
(B6). Twee dingen daaraan zijn met opzet zo en zijn makkelijk per ongeluk "recht te
zetten":

- **De vraag wordt vóór de verhuizing gesteld, en wegklikken voert de verhuizing alsnog
  uit.** Een doel lost op tegen waar de notitie nú staat, dus ná `moveNote` valt er niets
  meer te vinden. En het verplaatsen is wat de gebruiker aanklikte: een vraag over een
  neveneffect mag niet stilzwijgend ongedaan maken waar hij een neveneffect van is.
- **Een verwijzing zonder alias krijgt er een, met zijn oude doel erin.** `[[Spelregels]]`
  toont het woord "Spelregels"; herschreven naar een pad zonder alias zou een notitie waar
  je niet eens naar kijkt ineens een pad op het scherm zetten. Het oude doel is precies wat
  er stond, dus dat wordt de alias.

Een verwijzing die nergens naar wijst is geen fout: een notitie die nog geschreven moet
worden is een normaal ding om naar te verwijzen. De chip blijft gewoon staan en zegt bij een
klik wat er aan de hand is (`data-link="missing"`, gestippeld), in plaats van een dialoog op
te werpen.

Dubbele titels *binnen* één map leveren een waarschuwing bij het hernoemen in de
bibliotheek — geen weigering, want de vault is van de gebruiker — en met opzet niet bij het
opslaan vanuit het opnamevenster: een modaal venster op Ctrl+Enter is precies waar de
residente opzet voor bestaat.

---

## B36 — De PDF-miniatuur wordt door de app zelf getekend, niet door het besturingssysteem

**Genomen** op 7 augustus 2026, en het herroept de kern van B30. Gemeld als "de
PDF-preview werkt niet", op een verpakte macOS-build tegen een zakelijke OneDrive.
`nativeImage.createThumbnailFromPath` — B30's hele mechanisme — is op de hardware van de
gebruiker nooit iets zien opleveren, en elke mislukking op dat pad valt stil terug op de
labelchip, dus er was geen verschil tussen "geen provider", "kapotte PDF" en "dit formaat
heeft geen preview".

pdf.js in een verborgen `BrowserWindow` vervangt het. Dat venster tekent in zijn *eigen*
rendererproces, dus het budget van 80 ms op de hoofdthread blijft ongemoeid zonder dat er een
workerthread aan te pas komt, en `pdfjs-dist` blijft een `devDependency` die electron-vite
gewoon bundelt — een native canvas-binding (`@napi-rs/canvas`) zou een `dependencies`-regel,
een `check:bundle`-uitzondering en verpakkingsrisico op twee platforms hebben gekost.
`contextIsolation` en de sandbox blijven aan op die pagina: een PDF is niet-vertrouwde
invoer, dezelfde klasse waar de plakketen al voorzichtig mee is.

Twee gevolgen zijn met opzet zichtbaar. **Alleen `.pdf` krijgt nog een inline preview** —
`.docx`, `.xlsx` en `.pptx` blijven bijlagen die je kunt invoegen en openen, maar krijgen
een gewone chip; die formaten renderen zou een tweede, veel grotere afhankelijkheid
betekenen voor iets wat niemand gevraagd heeft. En **een echte mislukking ziet er anders uit
dan niets-om-te-tonen**: de protocolhandler antwoordt 422 waar hij eerst 404 gaf, en de chip
krijgt een markering met de reden in zijn `title`. Een kapotte PDF zag er tot dan toe
identiek uit als een `.txt`.

Onderweg kwam de werkelijke oorzaak van "de preview werkt niet" boven, en die zat niet in de
provider: `emqnote-thumb` is een `standard: true`-schema, dus Chromium normaliseert de URL
en plakt er een schuine streep achter — `isPreviewable` zag `.pdf/` en gaf 404. Zichtbaar
noch in een test, noch in de probe, tot beide de echte URL gingen gebruiken
(`attachmentNameFromUrl`).

---

## B37 — Een notitiebestand mag `.md` of `.markdown` heten, en houdt de extensie die het had

**Genomen** op 8 augustus 2026. De vault is een map op een OneDrive, en er komen bestanden
in die deze app niet geschreven heeft. Een notitie die de app weigert te tonen is onzichtbaar
in het enige venster op die map — dus `.markdown` wordt gelezen als `.md`.

`note-files.ts` is de ene plek die zegt wat een notitiebestand is; elke scan, watcher,
lijst, conflictcontrole en wezenloze-bijlagencontrole gaat er doorheen, in plaats van de
twaalf losse `endsWith(".md")`-controles die er eerst stonden. Nieuwe notities schrijft de
app nog steeds als `.md` — `noteFileName` is bewust niet aangeraakt.

**Een bestand houdt de extensie waarmee het binnenkwam**, door hernoemen, dupliceren en het
uniek maken van een naam heen. Iemands `.markdown` stilletjes in een `.md` veranderen is
niet aan de app. `conflicts.ts` paart bovendien binnen één extensie: een `.md` en een
`.markdown` met dezelfde naam zijn twee bestanden, en beweren dat het één notitie is die op
twee machines veranderde, zou een knop opleveren waarmee je er één van weggooit.

---

## Open punten

| Punt | Wanneer duidelijk |
|---|---|
| ~~Mag een ongetekende Electron-app draaien op de werkmachine?~~ | Ja — bevestigd op 25 juli 2026 |
| Is Power Automate beschikbaar? | Fase 6 — terugval staat klaar, blokkeert niets |
| Haalt Windows het latency-budget met de editor erin? | Nu — drie losse metingen (112/77/52 ms) zijn te weinig; zelftest daar draaien |
| Hoeveel geheugen kost het residente proces in de praktijk? | Fase 1 — raakt B2 |
| Hoe hardnekkig is de `mso-list`-reconstructie? | Fase 4 — het grootste onbekende stuk werk |
| Tekent het opnamevenster een bijlage werkelijk? | Nu — CSP en NodeView staan er, alleen nooit met een echte afbeelding gezien; zie `TEST-PROTOCOL.md` |
| ~~Levert `nativeImage.createThumbnailFromPath` op macOS en Windows echt een PDF-eerste-pagina op?~~ | Vervallen — B36 stelt die vraag niet meer: pdf.js tekent de pagina, en dat is op 7 augustus 2026 onder `Xvfb` werkend gezien, op precies dezelfde Chromium die de verpakte app meelevert. Wat een mens nog moet nakijken staat in `TEST-PROTOCOL.md` §4.5 |
| Verschijnt de eigen, knopvrije melding van het opnamevenster echt bij een externe wijziging? | Nu — het pad in de bibliotheek is op 7 augustus 2026 uitputtend bevestigd onder `Xvfb` (schoon/vuil/verwijderd, en geen valse balk bij eigen schrijfacties); het opnamevenster zelf nog niet, zie `TEST-PROTOCOL.md`, B31 |
| ~~Blijft het bij twee notitietypen?~~ | Ja, maar als etiket — beantwoord op 28 juli 2026, B20 |
