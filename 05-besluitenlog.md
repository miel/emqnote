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
want het is de plak-pijplijn uit fase 3 met een `.eml`-parser ervoor.

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
en dat komt pas in fase 3 aan de orde bij het plakken.

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
plakwerk van fase 3 tegenaan geschreven gaat worden.

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

## Open punten

| Punt | Wanneer duidelijk |
|---|---|
| ~~Mag een ongetekende Electron-app draaien op de werkmachine?~~ | Ja — bevestigd op 25 juli 2026 |
| Is Power Automate beschikbaar? | Fase 6 — terugval staat klaar, blokkeert niets |
| Haalt Windows het latency-budget met de editor erin? | Nu — drie losse metingen (112/77/52 ms) zijn te weinig; zelftest daar draaien |
| Hoeveel geheugen kost het residente proces in de praktijk? | Fase 1 — raakt B2 |
| Hoe hardnekkig is de `mso-list`-reconstructie? | Fase 3 — het grootste onbekende stuk werk |
| ~~Blijft het bij twee notitietypen?~~ | Ja, maar als etiket — beantwoord op 28 juli 2026, B20 |
