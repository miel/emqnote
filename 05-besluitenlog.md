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

*(Beantwoord op 12 augustus 2026, B42: het is ook `prosemirror-tables` niet geworden. Die
bibliotheek eist haar eigen schemavorm, en dat schema is hier het bestandsformaat.)*

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

**Aangevuld op 14 augustus 2026: het kan ook vanuit het menubalkpictogram.** De herstart-eis
verandert niet — de vier stukken staat hierboven staan er nog precies zo — maar de enige weg
ernaartoe was de Instellingen van het bibliotheekvenster, en op macOS is dat twee vensters
weg van het pictogram dat verder zo'n beetje het hele oppervlak van de app is. Het regeltje
`Vault: <pad>` is een submenu geworden: tonen in de verkenner, de vaults die deze machine
kent (uit dezelfde `listVaults` die het instellingenscherm toont, dus de twee kunnen niet
uit elkaar gaan lopen), en de mappenkiezer. Wat het menu *bevat* staat in een Electron-vrije
`vault-menu.ts`, want een `Menu`-sjabloon is onder `vitest` niet te bouwen en
`--click-button` komt een native menu sowieso niet in — dezelfde zet als `vaults.ts` en
`attachment-route.ts`.

Twee dingen die deze weg wél nodig had. Er wordt **bevestigd** met een dialoog die de
herstart benoemt: het instellingenscherm vraagt het al, en één klik twee regels diep in een
menu waarvan de buren onschuldig zijn is makkelijker per ongeluk te maken dan een handeling
in twee stappen. En de bibliotheek **spoelt haar eigen wachtende schrijfactie eerst** —
`IPC.libraryFlushSaves`, met een antwoord waar main op wacht en een grens van twee seconden.
Settings deed dat zelf op weg naar `switchVault`, want de klik zat in dat venster; het menu
heeft geen venster in de lus, en dat is precies het derde gevaar uit de lijst hierboven.
`switchVaultTo` is nu één functie die beide routes aanroepen — een tweede uitgeschreven
volgorde ernaast is hoe er één van die vier vergeten wordt op het pad dat niemand getest
heeft.

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

## B38 — Een bijlage wordt overal in de vault gevonden, en zijn URL draagt de naam in het pad

**Genomen** op 12 augustus 2026. Gemeld als: verwijzingen in de vorm
`![[99 - Attachments/7337fdd…_MD5.png]]` en
`[[99 - Attachments/…png|Open: Pasted image 20260526104144.png]]` tekenen niets.

`resolveAttachment` keek alleen in `_attachments/`. Dat klopte zolang elke bijlage er een
was die deze app zelf had weggeschreven, en het is precies dezelfde constatering als B37
over `.markdown`: een vault is een map op een OneDrive waar andere gereedschappen ook in
schrijven, en Obsidian's eigen gewoonte is een map naar keuze met een **pad** in het doel.
Een plaatje dat er gewoon stáát niet tekenen, omdat het onder een map hangt die deze app
niet gekozen heeft, maakt elke geïmporteerde notitie stuk.

Twee trappen, in deze volgorde: `_attachments/` eerst, dan de vault zelf. De traversal-guard
is niet zwakker geworden, alleen verankerd aan de vault in plaats van aan één map erin —
`realpathSync` aan beide kanten van de vergelijking, om dezelfde reden als bij `_trash`.

**Een notitiebestand lost hier nooit op.** Dat is wat de twee helften van
`IPC.openWikiLink` uit elkaar houdt: die vraagt dit eerst en valt alleen bij `null` door
naar de index, dus zonder die uitsluiting zou `[[01 Projecten/Spelregels.md]]` aan de
systeemviewer gegeven worden in plaats van in de bibliotheek te openen. De controle zit op
de extensie en niet op een schuine streep: een doel zonder extensie kan sowieso niet
botsen, want het bestand op schijf heeft er wel een.

Onderweg kwam er een tweede, hardere reden boven dat een pad-doel *nooit* had kunnen
werken, en die is van dezelfde familie als B36's schuine streep. Chromium canonicaliseert
de host van een `standard: true`-schema, en dat is tegen een echte Electron-build gemeten
in plaats van beredeneerd:

- **De host wordt kleingeletterd.** `emq-a://Pasted%20image.png` kwam bij de handler aan als
  `emq-a://pasted%20image.png/`. Elke naam die de app zelf schrijft is al kleine letters
  (`attachmentName` doet dat), dus een vault van alleen eigen bestanden merkte er niets van;
  een vault die in Obsidian geschreven is, staat er vol mee.
- **Een `%2F` in de host maakt de URL onparseerbaar.** Geen verminkt verzoek — `fetch` gooit
  "Failed to parse URL" voordat er iets verstuurd wordt. Een doel met een pad erin viel dus
  niet eens uit te drukken, wat `resolveAttachment` ook bereid was te vinden.

De naam staat daarom nu in het **pad**, achter één vaste host (`…://vault/<naam>`), waar
hoofdletters en `%2F` letterlijk bewaard blijven. `attachment-url.ts` in `src/shared/` is
de ene plek waar zo'n URL wordt samengesteld én teruggelezen; de oude host-vorm wordt nog
gelezen, omdat klembord-HTML die binnen de app is gekopieerd hem draagt.

---

## B39 — Een notitie zegt het wanneer het bestand dat hij noemt weg is

**Genomen** op 12 augustus 2026. Een ontbrekend plaatje tekende het gebroken-plaatje-icoon
van de browser, en een ontbrekend bestand een gewone chip die bij een klik niets deed. Allebei
lezen als "de app is stuk" in plaats van "dat bestand is er niet meer" — dezelfde klasse
fout als de labelchip die B36 uit elkaar trok.

De vraag wordt bij het **tekenen** gesteld, maar alleen voor een doel dat een *bestand*
noemt: iets met een extensie die niet die van een notitie is. Een notitieverwijzing houdt
haar antwoord-bij-klik uit B35, en dat is geen inconsequentie maar de kern ervan. Een
bestand opzoeken is één `statSync`; een notitie opzoeken heeft de hele index nodig, en een
verwijzing naar een notitie die nog geschreven moet worden is iets volstrekt normaals om in
een notitie te hebben staan — daar hoort geen waarschuwing bij voordat er geklikt is.

Drie dingen die dat betaalbaar en eerlijk houden:

- **Eén IPC per notitie, niet één per chip.** `setDoc` bouwt alle NodeViews in één
  synchrone doorloop, dus alle vragen van een notitie komen in dezelfde tick binnen en
  worden op een microtask samengevoegd.
- **Niets wordt onthouden tussen twee keer openen.** Een bijlage kán alsnog verschijnen —
  een OneDrive-bestand dat klaar is met binnenhalen, een plaatje dat net geplakt is — en een
  onthouden "weg" zou de markering over een plaatje heen blijven tekenen dat er inmiddels
  is. (De miniatuurcache van B36 onthoudt wél, om de omgekeerde reden: dát een PDF niet te
  tekenen is, is een eigenschap van de bytes.)
- **Een onbeantwoordbare vraag levert geen markering op.** Geen vault open, geen brug, een
  fout onderweg: dan wordt er niets gemarkeerd. De markering is een beschuldiging, en die
  hoort niet uit onwetendheid te komen.

De markering is dezelfde ⚠ die B36 gebruikt voor een PDF die niet te tekenen is. Eén
markering op één plek, want beide zeggen "er is iets mis met het bestand dat hier genoemd
wordt"; twee dialecten van dezelfde klacht zou alleen maar verwarren.

---

## B40 — Een PDF wordt in de app zelf gelezen, in een eigen venster

**Genomen** op 12 augustus 2026. B36 tekent de eerste pagina van een PDF en zet die als
chip in de notitie. Verder kwam je niet: een klik gaf het bestand aan `shell.openPath`, en
daarmee aan Preview of Acrobat. Pagina twee lezen betekende de app verlaten.

Een PDF opent nu in een eigen venster van emqnote — één klik, meteen de pagina's, met
**Open in system viewer** als knop in dat venster voor printen en annoteren. Alles wat de
app níét kan tekenen (`.docx`, `.xlsx`) gaat onveranderd naar het besturingssysteem;
`attachment-route.ts` zegt dat, en zegt niets anders. De chip in de notitie blijft wat hij
was, want dat is het ding waarop geklikt wordt.

**Waarom een venster en niet een bladerwidget ín de notitie.** Dat laatste was de eerste
gedachte, en het is de duurdere van de twee. De wachtrij van `pdf-thumb.ts` is één
plek diep en bedient de hele app: elke pagina zou een IPC-heen-en-weer met een PNG erin
kosten, plus een cache met een paginadimensie erbij die er nu niet is. Hier wordt het
document één keer geparseerd, in het eigen proces van dat venster, en blijft het open —
een pagina omslaan is scrollen. Daarbovenop vecht een hoge widget binnen een ProseMirror-atoom
met de editor om het scrollwiel, de cursor en de selectie, en dat levert de lezer niets op.

**Aan de miniatuurpijplijn is niets veranderd.** Geen enkele regel van `pdf-thumb.ts`,
`PdfThumbQueue`, `thumbnailKey`, de 404/422-protocolhandler of `failedThisSession`. Dat is
precies waarom een apart venster goedkoper was.

Eén ding moest wel: `emqnote-attachment` heeft er `corsEnabled: true` bij gekregen. Het
venster haalt de bytes met `fetch()` op, en een `fetch` handhaaft CORS ook voor een schema
dat deze app van begin tot eind zelf bezit — exact de val waar B36 al een keer in liep, waar
alle tests bleven slagen en in de echte app niets werkte. Bevestigd onder `Xvfb`: een echte
PDF van drie pagina's, het juiste aantal, en werkelijke inkt op het canvas gemeten in
plaats van alleen een `<canvas>` in de DOM — de les van B38.

Het venster is er één, hergebruikt: een tweede PDF richt het bestaande opnieuw. En
`openExternally` heeft geen argument. Main weet zelf welke bijlage het dit venster te zien
gaf en lost die op via `resolveAttachment`, dus het ergste wat een kwaadaardige PDF met die
uitgang kan doen is vragen om het bestand waar hij zelf al in staat.

---

## B41 — Een notitieverwijzing wordt geschreven door een notitie te kiezen

**Genomen** op 12 augustus 2026. B35 bouwde het hele apparaat om een `[[…]]`-verwijzing op
te lossen, te herschrijven en bij twijfel een keuze te vragen — maar niets in de app
*schreef* er ooit een. Je moest het pad van een notitie kennen en foutloos overtikken.
Bijlagen hebben `Mod+Shift+I`, `Mod+Shift+A` en twee knoppen; verwijzingen hadden niets.

De kiezer gaat open door `[[` te typen — het gebaar dat iedereen die uit Obsidian komt als
eerste probeert — en verder met `Mod+Shift+K`, een knop in beide werkbalken en een regel in
het rechtermuismenu. **In beide vensters**, want het opnamevenster is het venster waarin
notities daadwerkelijk geschreven worden.

Er wordt altijd `[[pad|Titel]]` weggeschreven, nooit een kaal `[[Titel]]`. Drie redenen, op
volgorde van wat het kost om het fout te doen: een pad matcht in de eerste trap van
`link-resolve.ts` en kan niet dubbelzinnig zijn, terwijl een titel in de tweede trap matcht
en door twee notities gedeeld kan worden — dan komt de keuzedialoog de rest van het leven
van die verwijzing bij elke klik terug, over een vraag die hier al beantwoord is.
`rewriteWikiLinks` heeft een pad nodig om iets te hérschrijven als de notitie verhuist. En
B35 geeft een verwijzing zonder alias er tóch een zodra de notitie verplaatst wordt; die
alias komt er dus hoe dan ook, en nu ziet de gebruiker het woord dat hij zelf koos.

**De `[[` blijft staan zolang de kiezer open is.** De inputregel neemt de twee tekens niet
weg maar geeft `null` terug, zodat een geannuleerde kiezer precies achterlaat wat er getikt
is — geen transactie om terug te draaien, en niets verrassends met de cursor. Het opruimen
gebeurt bij het invoegen, en `insertNoteLinkOverPrefix` kíjkt eerst of ze er nog staan in
plaats van dat aan te nemen: twee tekens uit iemands zin eten is een ergere fout dan er twee
laten staan.

**Het filteren gebeurt in main.** `MoveDialog` scoort een lijst mappen die hij in handen
kreeg; een vault heeft duizenden notities en de index beantwoordt die vraag al met FTS5. Dat
de filtertaal van de zoekbalk (`tag:`, `after:`) hier gratis in meekomt is daar een gevolg
van, geen apart gebouwde feature.

---

## B42 — Tabellen worden met de hand gebouwd op het bestaande schema

**Genomen** op 12 augustus 2026. `table`, `tableRow` en `tableCell` stonden al in het
schema en liepen al byte-identiek rond (corpusgevallen 9, 13 en 14) — een in Obsidian
geschreven tabel las en bewaarde correct. Maar er was geen enkel commando, geen sneltoets en
geen menu-item dat er één *maakte*, en geen manier om een rij of kolom toe te voegen aan een
tabel die er al stond.

**`prosemirror-tables` is opnieuw afgewezen**, en daarmee is de losse eindje van B17
dichtgelegd. Dat besluit sloot af met "voor tabellen betekent dat `prosemirror-tables`, en
dat komt pas in fase 4 aan de orde bij het plakken" — dit is dat moment, en het antwoord is
nee. Die bibliotheek eist haar eigen schemavorm: een `tableRole` op elk knooptype,
een apart `table_header`, en `colspan`/`rowspan`/`colwidth` op elke cel. Hier ís dat schema
het bestandsformaat (B6). GFM kan een samengevoegde cel helemaal niet uitdrukken —
`03-markdown-dialect.md` §3.5 houdt die als ruwe HTML — dus de editor zou tabellen kunnen
bouwen die de serializer moet weigeren. Dat is B6 van de verkeerde kant benaderd. Wat hier
werkelijk nodig is, is een handvol bewerkingen op een rechthoek.

Vier dingen die dragend zijn:

- **Elke bewerking bouwt de tabel opnieuw op en vervangt hem in zijn geheel.** Een kolom
  invoegen raakt elke rij, dus de variant die op berekende posities splitst moet bijhouden
  hoeveel elke eerdere ingreep de volgende opschoof — rekenwerk dat klopt tot een ongelijke
  rij het onderuithaalt.
- **Ongelijke rijen zijn een echte vorm, geen hypothese.** `from-mdast.ts` vult niet aan tot
  een gemeenschappelijke breedte, dus een met de hand geschreven korte rij komt als korte rij
  binnen. Elke kolombewerking maakt de tabel eerst vierkant. De uitlijningsrij schuift mee,
  anders erft elke kolom voorbij de ingreep die van zijn buurman.
- **Tab moet vóór `tabIndent` in de ketting.** Die laatste geeft altijd `true` terug, dus wat
  erachter staat draait nooit. `goToCell` weigert buiten een tabel, dus Tab in een lijst
  verandert niet. Die volgorde ís het mechanisme; de twee regels omdraaien haalt
  celnavigatie stilletjes weer weg.
- **Er staat altijd een regel onder de laatste blok.** `doc` is `block+`, dus een notitie mag
  op een tabel eindigen en dan is er geen tekstpositie meer achter. Een `appendTransaction`
  zet er een lege alinea achter — ook achter een codeblok, een HTML-blok en een streep, want
  dat is hetzelfde probleem. Het bereikt geen bestand: `withoutTrailingBlanks` in
  `to-mdast.ts` haalt een lege slotalinea er bij het schrijven al af, en dáárom is de
  invariant gratis.

De maat wordt gekozen op een raster van 8×8, het gebaar uit Word — de hele editor is gebouwd
op het idee dat iemand die Word kent geen tweede set gewoonten hoeft te leren. Kolomuitlijning
is er als menu-item bij gekomen: het formaat droeg `:---` al en de eerste rij was altijd al de
kop, maar niets in de app kon het zetten en niets liet het zien. Dat laatste kan CSS niet
alleen — uitlijning staat per kolom in een array op de tabel — dus een decoratie tekent het.

**Uitlijnen per cel kan niet, en dat is geen tekortkoming van de knoppen maar van het
formaat** (bijgeschreven 14 augustus 2026, uit dagelijks gebruik: "de uitlijningsknoppen
werken op een hele kolom in plaats van op één cel"). GFM schrijft de uitlijning één keer op,
in de scheidingsrij — `:---`, `:---:`, `---:` — dus `align` is een array op de *tabel* en
`tableCell` heeft in het geheel geen attributen. Eén cel anders uitlijnen zou betekenen dat de
tabel als ruwe HTML geschreven wordt, en dat breekt de byte-identieke round trip, de
corpusbestanden en de weergave in Obsidian in één keer — dezelfde reden waarom een
samengevoegde cel onmogelijk blijft (B6, B49). Wat de knoppen wél doen is precies wat er nog
te doen valt: `setColumnAlign` leest `selectedRect` net als elk ander commando, dus zonder
selectie is het de kolom van de cursor en met een rechthoek zijn het de kolommen die hij
bestrijkt — nooit de hele tabel.

---

## B43 — Een PDF wordt met `![[…]]` in de notitie zelf gelezen

**Genomen** op 13 augustus 2026. B36 tekent de eerste pagina van een PDF en B40 opent hem in
een eigen venster — maar allebei pas ná een klik. In de notitie stond een chip van 96 pixels
breed, en wie een offerte in zijn aantekeningen zet wil die zien staan, niet aanklikken. De
vraag zoals hij binnenkwam: "er is een prachtige PDF-lezer, maar hij gaat pas open als je op
de miniatuur klikt."

**De twee schrijfwijzen betekenen nu twee verschillende dingen.** `![[offerte.pdf]]` tekent
pagina één op de breedte van de kolom; `[[offerte.pdf]]` blijft de chip van B36, met de
kleine miniatuur ernaast, die het venster van B40 opent. Dat onderscheid bestond al voor
afbeeldingen — een embed tegenover een verwijzing — en het bestandsformaat wist het allang:
`from-mdast.ts` heeft nooit naar de extensie achter een `![[…]]` gekeken. **Aan het formaat
is dan ook geen letter veranderd.** Wat ontbrak was een NodeView en een grotere tekening.

**Er komt geen pdf.js in de editorbundel.** Dat was de voor de hand liggende manier om een
echte lezer in de notitie te zetten, en het is de verkeerde: het opnamevenster tekent
dezelfde NodeView, en dat is het venster dat binnen 80 ms op het scherm moet staan met een
bundel die daarom klein gehouden wordt. In plaats daarvan vraagt de embed dezelfde pijplijn
als de chip om een tweede maat — `emqnote-thumb://vault/<naam>?size=page` — en tekent het
verborgen venster van B36 die pagina, één keer, met de PNG op schijf in de cache. De bundel
van het opnamevenster is na dit werk nog steeds vrij van pdf.js; `pdf-fit` zit alleen in de
twee ingangen die er al in zaten.

**Eén schema met een maat erop, geen tweede schema.** De doorloopbeveiliging van
`resolveAttachment`, de `isPreviewable`-poort en de 404/422-splitsing zijn voor allebei
dezelfde beslissingen. Twee handlers zouden twee plekken zijn om ze te veranderen. De maat
staat in de *query* en niet in een tweede padsegment, omdat de naam één ondoorzichtig segment
is (B38) — en `encodeURIComponent` maakt nooit een `?`, dus knippen bij de eerste `?` kan
nooit in een naam snijden.

**Alleen een 422 wordt onthouden, een ontbrekend bestand niet.** Dat is B39 van de andere
kant: dat een PDF niet te tekenen is, is een eigenschap van de bytes en blijft waar; dát hij
er niet is, is een eigenschap van dít moment — een OneDrive-bestand dat nog binnenkomt maakt
het onwaar. Dit is niet uit de code afgeleid maar door het te draaien gevonden: in de eerste
versie kwam een teruggezet bestand pas na een herstart weer als pagina terug. De herhaalde
vraag kost één 404 uit `resolveAttachment` en bereikt de tekenpijplijn niet eens.

**Een PDF invoegen schrijft nu `![[…]]`.** Anders was de hele functie alleen bereikbaar door
met de hand `![[…]]` te tikken, en dat is precies wat een WYSIWYG-editor niet toelaat. Een
`.docx` blijft een verwijzing, want daar valt nog steeds niets aan te tekenen. Een met de
hand geschreven `[[offerte.pdf]]` blijft geldig en wordt bij het openen niet aangeraakt (B10).

De balk onder de pagina draagt de bestandsnaam en de ⧉ naar het venster van B40 — daar
worden pagina twee en verder gelezen, en dít blijft één pagina. Alleen die balk slikt de
`mousedown`: op de pagina zelf klikken maakt een gewone `NodeSelection`, want een atoom dat je
niet kunt selecteren is er één die je niet meer weg krijgt.

Bevestigd onder `Xvfb` tegen een echte PDF van `pdflatex`: de pagina getekend op 1240×1754
en weergegeven op 591 CSS-pixels, met **5678 werkelijk donkere pixels geteld** op het beeld —
de les van B38, dat een `<img>` in de DOM geen bewijs is. Verder de ⧉ die het venster op drie
pagina's opent, de gemarkeerde chip als het bestand weg is, en de pagina die terugkomt zodra
het bestand terugkomt.

---

## B44 — Een map hernoemen repareert de verwijzingen erheen, zonder te vragen

**Genomen** op 13 augustus 2026. `renameFolder` droeg deze zin: *"Nothing inside needs
rewriting: wikilinks and embeds carry bare names, not paths."* Dat klopte toen het er stond en
is bij B35 opgehouden te kloppen — een verwijzing die deze app schrijft is
`[[01 Projecten/2026-08-05 1030 Rules|Rules]]`, een pad, en sinds B41 is dat de enige vorm die
de app nog produceert. Een map hernoemen verplaatst dus elk pad eronder, en liet elke
verwijzing erheen kapot achter. Stil, want een kapotte notitieverwijzing houdt zich
opzettelijk gedeisd tot je erop klikt (B35) — het juiste gedrag voor een notitie die nog
geschreven moet worden, het verkeerde voor een verwijzing die deze app zojuist zelf brak.

De reparatie heeft dezelfde vorm als die van `IPC.libraryMoveNote`, één niveau hoger, en de
volgorde is het dragende deel: **de vraag wordt vóór de hernoeming gesteld**, want een doel
lost op tegen waar een notitie *nu* staat, en na `renameFolder` valt er niets meer te vinden.

**Er wordt niet gevraagd.** Bij één notitie doet B35 dat wel, en dat is daar juist: verplaatsen
is een keuze over die ene notitie, en de verwijzingen zijn een neveneffect. Een map hernoemen
is geen gebaar over één notitie; een dialoog die notities telt waar de gebruiker niet aan
dacht, staat in de weg van een reparatie die niemand redelijkerwijs kan willen weigeren. Dit
is een keuze van de gebruiker, hier vastgelegd zodat de asymmetrie met B35 zichtbaar blijft.

Twee dingen zijn makkelijk verkeerd te doen en daarom een eigen, Electron-vrije module
(`folder-rename-links.ts`) waard. **Een verwijzende notitie kan zélf in de map staan** — die
moet op haar *nieuwe* pad herschreven worden, anders schrijft de reparatie naar een pad dat
niet meer bestaat en slaat `rewriteWikiLinks` het in stilte over. En **het nieuwe doel wordt
samengesteld, niet opnieuw opgezocht**: opnieuw opzoeken zou eerst een scan kosten, terwijl het
antwoord rekenwerk is — hetzelfde pad met één voorvoegsel verwisseld.

`linkingNotesUnder` stelt de vraag voor de hele map in één keer: één opgebouwde index en één
gang door de verwijzingstabel. `linkingNotes` weigert er al één-voor-één op te lossen omdat dat
kwadratisch is; per notitie in een map die functie aanroepen bereikt dezelfde vorm van de
andere kant.

De hernoeming heeft er meteen de grendel bij gekregen die `IPC.libraryTrashFolder` al had en
deze handler miste: een map met daarin een notitie die het opnamevenster geclaimd heeft, wordt
geweigerd. `CaptureWriter` pint het pad waar hij naartoe schrijft vast, en de map eronder
verplaatsen werkt dat pad niet bij — dezelfde "één notitie in twee mappen"-val.

Een map *verwijderen* blijft de verwijzingen erheen wél breken, en dat is de bedoeling: die
notities liggen in de prullenbak, en een verwijzing naar iets weggegooids hoort dat te zeggen.

Bevestigd onder `Xvfb`: `Klant A` hernoemd naar `Klant Alpha`, het bestand op schijf draagt
daarna `[[Klant Alpha/2026-08-12 1000 Doelnotitie|de regels]]`, er kwam geen dialoog, en de
verwijzing opent de notitie weer.

---

## B45 — Ook `![[…]]` staat in de index, want een map hernoemen verplaatst bijlagen

**Genomen** op 13 augustus 2026, na een foutmelding op B44: een map met afbeeldingen in de
hoofdmap van de vault hernoemd, en geen enkele verwijzing naar die afbeeldingen werd
bijgewerkt. Dat klopte, en het waren twee gaten tegelijk.

Het eerste zit in de index. `note_links` bevatte alleen `[[…]]`-verwijzingen, met een
expliciete reden in `wiki-targets.ts`: *"an attachment never moves as a consequence of a
note moving"*. Dat was waar voor alles wat B35 kon — bij een notitie die verhuist blijft een
bijlage staan waar hij stond. Het is onwaar geworden op het moment dat een **map** hernoemd
kon worden (B44), want dan verplaatst elk bestand eronder wél. `linkingNotesUnder` vond dus
nul notities voor een map vol plaatjes: er stond niets over te vinden. Dezelfde vorm als de
zin in `renameFolder` die B44 zelf verving — een opmerking die klopte toen hij geschreven
werd, later niet meer, en die precies daarom onzichtbaar maakte wat er stukging.

Het tweede zit in het herschrijven: `rewriteWikiLinks` kijkt alleen naar `wikiLink`. Een
`wikiEmbed` werd nooit aangeraakt, ook niet als hij toevallig wel gevonden was.

**De index bewaart nu beide, met een `kind`-kolom** (`SCHEMA_VERSION` 3, dus één herbouw —
B26 staat dat toe, want de index is een afgeleide cache buiten de vault). `linkingNotes` en
`linkingNotesUnder` filteren op `kind='link'`, zodat de vraag van B35 — welke *notities*
verwijzen hiernaar — exact blijft wat hij was en de bevestiging bij een verplaatsing geen
plaatjes gaat meetellen.

**De reparatie voor bijlagen doet geen resolutie, maar rekent op de tekst.**
`linkingNotesUnder` vraagt "welke notities wijzen naar déze notitie", en dat vereist de drie
trappen van `link-resolve.ts`. `targetsUnder` vraagt iets anders: "welk doel noemt een pad
binnen deze map", en dat is een vraag over de string. Een bijlagedoel lost namelijk nooit op
naar een notitie — dat is exact waarom de eerste versie zweeg — en `resolveAttachment` werkt
op paden, dus een doel dat een pad draagt breekt zodra dat pad verandert.
`rewriteTargetPrefix` wisselt dan één voorvoegsel om, in `wikiEmbed` én `wikiLink`, via
`parseNote` → `serializeNote` → `writeAtomic` zoals elke andere schrijfactie (B6).

Twee dingen die er bewust *niet* gebeuren. **Er wordt geen alias verzonnen**: B35 doet dat
omdat een verwijzing op titel die een pad wordt anders ineens een pad laat zien, maar een
doel dat al een pad was verandert niets aan wat er op het scherm staat, en een embed heeft
helemaal geen alias. En **een kale naam blijft staan**: `![[foto.png]]` draagt geen map, dus
er is niets om te herschrijven.

De prefix is `Bijlagen/` en niet `Bijlagen`, anders zou een map die toevallig zo begint —
`Bijlagen extra` — meeveranderen.

Bevestigd in de echte app onder `Xvfb`: een echte PNG in `99 - Attachments` in de hoofdmap,
de map hernoemd naar `Bijlagen` vanuit de werkbalk, en daarna zowel `![[Bijlagen/foto.png]]`
als `[[Bijlagen/foto.png|de foto]]` op schijf — met de afbeelding daadwerkelijk getekend
(`naturalWidth` 120) en zonder ontbrekend-markering.

---

## B46 — De ingesloten pagina bladert zelf, maar blijft dezelfde tekening

**Genomen** op 13 augustus 2026, drie dagen na B43 en uit hetzelfde gebruik: één pagina van
een offerte van drie is geen offerte. B43 zei met zoveel woorden "dít blijft één pagina", en
dat was toen de juiste grens — het alternatief dat toen voorlag was een echte lezer in de
notitie, met pdf.js in de editorbundel, en die grens staat nog steeds.

**Wat er is bijgekomen is een getal, geen pijplijn.** De balk onder de pagina heeft nu
vorige/volgende, "Pagina 2 van 7", een Fit-knop en dezelfde ⧉ als eerst. Bladeren is exact
hetzelfde verzoek met één cijfer erbij — `?size=page&page=3` — door dezelfde
`emqnote-thumb`-handler, dezelfde doorloopbeveiliging, dezelfde 404/422-splitsing, dezelfde
verborgen tekenwindow van B36 met zijn ene sleuf. Er zit nog steeds geen pdf.js in het
opnamevenster, en dat is de reden dat dit mocht: was de prijs een tweede tekenpad geweest,
dan was het antwoord nee gebleven.

**Pagina 1 wordt niet gespeld.** `?size=page` zonder cijfer betekent de eerste, in de URL én
in de cachesleutel. Dat is geen netheid: een veranderde sleutel maakt elke al getekende
eerste pagina in `userData` wees, en elk van die pagina's is een pdf.js-tekening die dan
opnieuw moet.

**Het aantal pagina's komt over IPC, niet als antwoordheader.** Bij het tekenen is het
gratis — pdf.js heeft het bestand net gelezen — maar het moet de tekening overleven, want na
een herstart is pagina 1 een cachetreffer zonder tekening om het aan te vragen. Het staat
daarom als `<sleutel van pagina 1>.pages` naast de PNG, met dezelfde
verouderingsregel (`mtime`+`size` zitten in de sleutel) en dezelfde opruiming. Het *vervoer*
is `IPC.pdfPageCount` en met opzet geen header op het `emqnote-thumb`-antwoord, waar het
anders vanzelf meeliftte: deze app heeft al twee keer een CORS-val op een eigen schema
uitgeleverd (B36 op `emqnote-thumb`, B40 op `emqnote-attachment`), allebei onzichtbaar voor
elke test en fataal in het echte venster, en een eigen responseheader is de volgende sport
van diezelfde ladder. Eén extra rondje IPC per embed, naast het rondje dat B39 er al voor
maakt.

**Eén tekening, ook als er twee tegelijk om vragen.** De embed vraagt de pagina en het aantal
naast elkaar, en drie NodeViews van dezelfde PDF vroegen het al eerder tegelijk;
`ensureThumbnail` houdt nu bij wat er onderweg is en laat ze op dezelfde tekening wachten.
Zonder dat betaalde elke vrager zijn eigen pdf.js-ontleding van hetzelfde bestand.

**Fit is een tweede maat op het scherm, niet een derde tekening.** De PNG is en blijft
`PAGE_SIZE`; de knop wisselt tussen de breedte van de kolom (zoals B43) en de hele pagina
binnen 70vh. Zoomen, tekst selecteren en de weg naar de systeemviewer blijven in het venster
van B40 — daar is de ⧉ voor, en daarom is die knop gebleven waar hij stond.

Bevestigd onder `Xvfb` tegen dezelfde PDF van drie pagina's van `pdflatex`: "Pagina 1 van 3"
bij het openen, drie **werkelijk verschillende beelden** geteld (elk in een canvas
uitgerekend, niet alleen een `src` die veranderde — de les van B38), terugbladeren dat exact
hetzelfde beeld oplevert als de eerste keer, de volgende-knop die op de laatste pagina
uitgaat, en Fit die de pagina van 836 naar 513 pixels hoogte brengt.

## B47 — Bestanden die geen notitie zijn, staan gewoon in de bibliotheek

**Genomen** op 14 augustus 2026, uit een vault die in Obsidian is begonnen. Zo'n vault
bewaart zijn afbeeldingen en pdf's in een doodgewone map naast de notities — meestal
`99 - Attachments` — en die map was doorbladerbaar en volstrekt leeg: een `0` in de boom en
"Geen notities" zodra je erop klikte. Alles wat erin stond was onzichtbaar voor de app.

**Er hoefde niets gebouwd te worden om die bestanden te *tonen*.** `resolveAttachment` lost
sinds B38 een willekeurig vault-relatief pad op, `emqnote-attachment://` levert het uit
(B28), `emqnote-thumb://…?size=page` tekent er een pdf-pagina van (B36/B43) en
`openWikiLink` stuurt een `.docx` al naar het besturingssysteem en een `.pdf` naar het
venster van B40. Het enige dat ontbrak was iets dat ze *opsomt*: `readFilesIn`.

**Een aparte lijst en een apart type, geen bredere `NoteSummary`.** Sorteren, slepen,
verplaatsen, dupliceren, taken en de conflictcontrole nemen allemaal een `NoteSummary` aan,
en geen van die vragen betekent iets voor een `.png`. Een bestandsrij die de helft van dat
menu zou beantwoorden en de andere helft niet, leest slechter dan een rij die zichtbaar geen
notitie is. Daarom een tweede sectie onder de notities, met alleen wat een bestand heeft:
naam, soort, grootte, datum. Er zit ook geen verwijderen bij — één onomkeerbare handeling
naast de prullenbak is genoeg (B24/B27).

`_attachments` blijft verborgen en onbladerbaar. Dat is de eigen map van de app en die heeft
zijn eigen scherm (§6.5); dit gaat over de map die de *gebruiker* heeft gemaakt.

**Het voorbeeldvenster is de leeskant van dezelfde beslissing.** Een afbeelding tekent
zichzelf via het protocol, een pdf vraagt de pagina op die de verborgen tekenwindow toch al
maakt — met opzet geen pdf.js in de bibliotheekbundel, dezelfde grens die B43 trekt — en
alles daarbuiten zegt dat het geen voorbeeld heeft en biedt de systeemviewer aan. Dat laatste
is geen verontschuldiging maar het antwoord: deze app heeft niets te zoeken in het tekenen
van Office-formaten, en het besturingssysteem eronder wel.

**Hetzelfde argument heeft en passant het scherm voor verweesde bijlagen gerepareerd.** Dat
haalde elk voorbeeld als base64 door IPC — het hele bestand, ~1,37× opgeblazen — en vroeg ze
allemaal tegelijk op, zodat er niets verscheen tot de laatste binnen was. Dat is precies wat
B28 voor de afbeeldingen in een notitie heeft geweigerd; de uitzondering die hier ooit is
opgeschreven luidde "het is één bestand, één keer", en dat is het niet.

---

## B48 — Een verwijzing naast zijn eigen insluiting wordt niet getekend

**Genomen** op 14 augustus 2026, uit dezelfde geïmporteerde vault. Obsidian schrijft bij het
invoegen van een pdf twee dingen: de insluiting `![[99 - Attachments/offerte.pdf]]` en er
pal naast de gewone verwijzing `[[99 - Attachments/offerte.pdf]]`. Gelezen in deze app is dat
een hele pagina met daaronder een chip die naar de pagina erboven wijst.

**Het bestand houdt allebei de spellingen.** Dit is een `DecorationSet` en niets anders, dus
er is geen B10- of B6-vraag te beantwoorden: er wordt niets herschreven, er valt bij het
bewaren niets weg, en een vault die met Obsidian gedeeld wordt blijft precies zeggen wat
Obsidian verwacht. Verbergen is ook de omkeerbare helft van de keuze — het knooppunt staat er
nog gewoon, dus Backspace haalt het alsnog echt weg als dat de bedoeling was.

**Alleen als ze buren zijn.** Een verwijzing en een insluiting aan weerszijden van een lange
notitie zijn twee bedoelde vermeldingen van hetzelfde bestand, en de tweede stilzwijgend
opslokken zou deze regel iets laten beslissen wat hij niet kan weten. Het paar dat Obsidian
schrijft staat altijd naast elkaar, en dat is dus het hele criterium: dezelfde alinea, niets
ertussen dan witruimte of een regelovergang, in willekeurige volgorde.

**Wat het draaien wél vond en het lezen niet:** de eerste versie zette `display: none` op
`.wiki-link-duplicated`, wat op specificiteit gelijkspeelt met `.wiki-link-preview`
(`display: inline-flex`, voor een chip met een miniatuur erop) en op bronvolgorde verliest.
Een `.pdf` — het enige soort chip waarvoor Obsidian dit paar überhaupt schrijft — bleef dus
gewoon getekend worden. Beide klassenamen op één selector nu.

---

## B49 — Een rechthoek cellen is selecteerbaar, met een eigen `Selection`

**Genomen** op 14 augustus 2026, uit dagelijks gebruik: een tabel was alleen cel voor cel te
bewerken. Slepen over cellen léék te werken — de browser tekende zijn eigen selectie — en
daarna deed Backspace niets en werkte de knoppenbalk op één cel van de rechthoek. `tableCell`
is `isolating`, dus de ene vervangstap die zo'n `TextSelection` nodig heeft wordt geweigerd:
de toets verdween in het niets.

**Weer met de hand, om precies de reden van B42.** `prosemirror-tables` heeft hier ook een
`CellSelection` klaarliggen, maar die komt met zijn `TableMap`, zijn `tableRole`s, zijn eigen
kopnode en `colspan`/`rowspan` op elke cel — en dit schema *is* het bestandsformaat, waar GFM
geen samengevoegde cel kan opschrijven. Wat nodig is, is een rechthoek over een matrix, en
dat is `table-selection.ts` geworden: `visible = false` (de browser tekent er niets overheen,
de decoratie in `table-align.ts` is alles wat je ziet), één bereik per cel, `map` die netjes
terugvalt op een cursor als de cellen weg zijn, en `content()` die de rechthoek als een echte
tabel op het klembord zet.

**Eén rechthoek voert álle bestaande opdrachten.** `selectedRect` beantwoordt de vraag "waar
gaat dit over" voor een cursor (één cel) en voor een selectie (de hele rechthoek), en elk
commando uit B42 leest dat. Daardoor betekent "rij weg" *de rijen die je aanwijst* zonder een
tweede pad, en "rij eronder" voegt er evenveel toe als je er hebt geselecteerd — het gedrag
van Word, en de enige lezing waarin een rechthoek niet minder betekent dan een cursor.

**Wat het draaien vond en het lezen niet, twee keer.** De eerste versie zette wel een
`CellSelection`, maar de knop was nog ingedrukt: Chromium breidde zijn eigen tekstselectie uit
over de cellen, `prosemirror-view` las die bij elke `selectionchange` terug en zette er een
`TextSelection` overheen. Traag slepen eindigde met niets geselecteerd, snel slepen met de
rechthoek die de race won. `createSelectionBetween` is het antwoord — tijdens het slepen is de
selectie van deze plugin — en geen enkele test onder `test/` had het kunnen zien. De tweede:
de opmaakregel voor de kopregel (`table tr:first-child td`) is één klasse én één pseudoklasse
diep, dus een vulling op `td.table-cell-selected` verliest daarvan op specificiteit — en de
kopregel is nu juist de rij die bij een kolomselectie altijd meedoet. Dezelfde familie als de
fout die B48 beschrijft.

**Samenvoegen blijft onmogelijk, en dat is geen tekortkoming maar B6.** GFM kan het niet
opschrijven, dus de editor mag het niet kunnen maken. Het plakken van een gekopieerde
rechthoek *in* een andere rechthoek is bewust niet gebouwd: een gekopieerde rechthoek plakt
als tabel, wat is wat `content()` maakt.

---

## B50 — Een afbeelding van het web wordt door main opgehaald en lokaal bewaard

**Genomen** op 14 augustus 2026. Een notitie die elders is geschreven staat vol
`![Naam](https://…)`, en die tekenden hier geen van alle: de CSP laat in beide vensters geen
enkele externe afbeeldingsbron toe. Dat was met opzet zo, en het argument dat erbij stond
klopt nog steeds — een notitie die bij elke opening bij een willekeurige host langsgaat is een
tracking pixel met extra stappen, en hij is leeg zodra de machine offline is of de andere
machine hem opent.

**Het bezwaar gold nooit de afbeelding, maar wie hem ophaalt.** Dus: **main** haalt hem op,
één keer, door precies de keten die een geplakte afbeelding al doorloopt (`remote-image.ts`'s
schema-lijst, de hercontrole bij elke `Location`, `credentials: "omit"`, de time-out, beide
byte-plafonds, de magische bytes), bewaart de bytes in `userData` (B9, dus buiten de vault —
in `_attachments/` zetten zou betekenen dat het openen van een notitie een bestand in de vault
schrijft, en dat is B10 van de verkeerde kant) en dient ze uit over `emqnote-remote://`. De
renderer raakt het netwerk niet aan, de CSP noemt nog steeds geen enkele host, en een notitie
die één keer gelezen is leest daarna ook zonder internet.

**De schakelaar staat in Settings en staat aan.** Uit is een verdedigbare positie — het openen
van zo'n notitie laat main dat adres opvragen, en de host ziet dat — maar een kolom grijze
chips is niet wat die notities zeggen. Main beslist, in de protocolafhandelaar, niet de
renderer.

**Wat het draaien vond en het lezen niet:** met de schakelaar uit tekende een al eerder
geopende notitie zijn plaatjes gewoon opnieuw. Chromium beantwoordt een URL die hij al eens
getekend heeft uit zijn eigen afbeeldingscache, zónder de afhandelaar te raadplegen —
`no-store` erbij hielp niet genoeg. De renderer heeft daarom zijn eigen kopie van de
instelling en vraagt niets meer als het antwoord nee is; main blijft de autoriteit, dit is
alleen wat voorkomt dat de vraag een tweede keer wordt gesteld.

**Geen `corsEnabled` op dit schema**, en dat is bewust: niets `fetch()`t het — het is een
`<img>`. Als dat ooit verandert is dat de eerste regel om aan te passen, want juist die
weglating heeft twee keer eerder een functie stilletjes doodgelegd (B36, B40).

---

## B51 — `/` aan het begin van een regel opent het invoegmenu

**Genomen** op 14 augustus 2026. Alles wat je in een notitie kunt zetten zat achter een knop,
een rechtermuisklik of een toetscombinatie. `/` is wat iedereen die uit Notion of Obsidian
komt als eerste probeert, en het is de enige route die niets kost terwijl beide handen
typen.

**Filteren gebeurt in de notitie zelf.** Het menu hangt onder de cursor en je typt gewoon
door; wat achter de `/` staat filtert de lijst. Dat is de reden dat het géén React-overlay met
een eigen invoerveld is zoals de notitiekiezer (B41): dat neemt de cursor weg, en dat is precies
wat hier niet mag. Een gewone DOM-plugin dus, zoals `table-toolbar.ts` zijn balk tekent — en
daardoor staat het in beide vensters zonder dat een van de twee er iets voor hoeft te weten.

**Alleen als de `/` het enige op de regel is.** Een `/` in een zin is een schuine streep — een
datum, een pad, "en/of" — en een menu dat daaroverheen opengaat staat in de weg. In een
tabelcel gaat het ook niet open: daar past geen kop, geen lijst en geen scheidingslijn, en een
menu waarvan elk item weigert is erger dan geen menu.

**De `/` blijft staan zolang het menu open is**, net als `[[` (B41): Escape laat precies staan
wat je typte en er valt niets ongedaan te maken. Bij het kiezen wordt het voorvoegsel
weggehaald **vóór** het item wordt uitgevoerd — vier items openen een eigen kiezer en voegen
pas later in, en achteraf verwijderen zou ofwel de verkeerde tekens opeten ofwel om dezelfde
positie vechten.

**Wat het draaien vond:** de scheidingslijn — nu het makkelijkst bereikbare item van het menu
— werd door het eerstvolgende getypte teken meteen weer opgeslokt.
`replaceSelectionWith` laat een `NodeSelection` op de regel staan, want die is selecteerbaar.
`insertHorizontalRule` zet de cursor sindsdien op de regel eronder. Dat was al zo sinds de
scheidingslijn bestaat (14 augustus 2026, eerder die dag) en niemand had het gezien.

---

## B52 — Een `#tag` in de tekst opent op Mod+klik

**Genomen** op 15 augustus 2026. Een tag in de body telde al overal mee — `summarise()` voegt
`extractTags(body)` bij de frontmatter-tags, dus hij stond al in de Tags-lijst en antwoordde al
op `tag:` in de zoekbalk. Alleen het gebaar ontbrak: hij was gekleurd en verder niets. Mod+klik
opent nu de bibliotheek met die tag als filter.

**Mod+klik, geen gewone klik**, precies om B33's reden. Een tag is gewone, bewerkbare tekst
(B19) en dat blijft hij: de gewone klik moet de cursor blijven zetten, anders is een typefout
ín een tag niet meer te verbeteren met het enige gebaar waar iedereen naar grijpt. Obsidian doet
het anders, maar Obsidian heeft een leesmodus om het in te doen en dit venster is er één.
Er komt ook geen pil of achtergrond bij: dat belooft een gewone klik die iets doet, en dat is
nu juist de klik die niets mag doen. `.link-mod-hover` — al aanwezig voor de weblink — wijst
het aan zolang de toets ingedrukt is, en dat is de hele affordance.

**Geen mark en geen node.** B19 staat overeind: de tag blijft een decoratie naast het document,
en niets hiervan raakt de serializer of de round trip. Wél verhuist de naam mee in de *spec* van
die decoratie, zodat `tagAt` de klik uit dezelfde verzameling beantwoordt die de kleur tekent —
één vraag, één antwoord, dezelfde reden waarom `resolveAttachment` in B39 de marker en de klik
tegelijk bedient. Een `#` in code doet daardoor gratis niet mee.

**De klik gaat via main, ook als hij in de bibliotheek zelf gemaakt is**, net als
`IPC.openWikiLink`. De verleiding is om de bibliotheek zijn eigen klik te laten afhandelen en
alleen het opnamevenster om te leiden — dat is precies hoe één gebaar twee gedragingen krijgt.
Main lost hier niets op: een tag is een naam, en het vouwen van hoofdletters gebeurt waar de
lijst gebouwd wordt (`foldTag`). Wat main wél doet is het venster wekken, inclusief de
`isLoading()`-uitgestelde verzending die B35 al nodig had: de eerste Mod+klik vanuit het
opnamevenster is heel vaak juist de aanroep die de bibliotheek *maakt*.

**De Tags-lijst vouwt zichzelf open**, in `FilterSection` en niet bij de aanroeper. Zo landt
elke route naar een tag-selectie hetzelfde, ook een toekomstige. Twee dingen die alleen bij het
draaien zichtbaar zijn en er anders uitzien als "het filter werkte niet": de rij wordt
hoofdletter-ongevoelig vergeleken (`#KlantX` in een notitie en `klantx` in de lijst zijn één tag
voor `notesMatching` en twee strings voor `selectionKey`), en een tag die buiten de vijftig
getoonde rijen of buiten het filtervakje valt wordt er alsnog bovenaan bij gezet — anders filtert
het notitiepaneel op iets dat het zijpaneel niet toont, en is er geen rij om weer uit te komen.

---

## B53 — Geen iPad-client; de vluchtweg ís het antwoord

**Genomen** op 15 augustus 2026. Onderweg lezen en taken afvinken gebeurt in Obsidian mobile
op dezelfde vault. Er komt geen eigen iPad-app. De hele afweging staat uitgeschreven in
`06-ipad.md`; hieronder alleen wat er is besloten en waarom.

**Waarom.** B7 kocht dit geval al, met zoveel woorden: standaardgereedschap dat de vault
correct opent, "als er iets **onderweg** gelezen moet worden". Het gevraagde bereik — lezen
en taken — is precies dat geval. En het sluit juist het onderdeel uit dat het bouwen van
deze app rechtvaardigde: een alinea, een tabel of een geneste gemengde lijst onder een
opsommingsteken, waar Obsidian faalt en waar `schema.ts`' `paragraph block*` voor bestaat.
De iPad zou de helft van het probleem oplossen die de vluchtweg al dekt, en de helft
overslaan waarvoor dit project bestaat.

**Op grond van die redenering, niet van een proef.** `06-ipad.md` §7 noemt twee stappen die
de eerlijke manier zouden zijn om §3 te toetsen — tien minuten MDM-controle op het toestel,
en twee weken Obsidian mobile op de echte vault. **Geen van beide is uitgevoerd**, en dat
hoort hier te staan: dit is een beredeneerd besluit, geen gemeten. Wie het ooit wil
omdraaien begint daar, niet bij fase iii. Dezelfde soort labeling als bij de PDF-miniatuur
op zakelijke OneDrive, waar het vermoeden uitdrukkelijk als vermoeden is opgeschreven.

**Wat is afgevallen.** Een Capacitor-schil om de bestaande renderer (technisch de beste
route — `src/markdown/` en `src/shared/` importeren Electron noch `node:` en gaan gratis
mee, dus B6 blijft per constructie overeind — maar 6–9 weken, $99 per jaar en een tweede
onderhoudsdoel voorgoed), en een native SwiftUI-herbouw, die een **tweede serializer in
Swift** vergt. Dat laatste is wat B6 verbiedt, en het is geen theoretisch bezwaar: die zou
`MARK_NESTING_ORDER`, de tag-uitzondering van B19, de `- [ ]`-afhandeling die GFM zelf niet
terugleest en het wisselende opsommingsteken dat twee lijsten uit elkaar houdt moeten
naspelen — en blijven naspelen, op het platform waar de rondgang het lastigst te inspecteren
is. Stuk voor stuk dingen die hier één keer echt debuggen hebben gekost.

**Prijs.** De beste mobiele client voor deze vault is andermans app. Twee mentale modellen.
Het kopblok, de mappen zonder underscore en het takenoverzicht bestaan onderweg niet.

**Wat dit niet is.** Geen uitspraak over opname onderweg. Dat is route D in `06-ipad.md` —
een Shortcut die een correct gevormde `.md` in de Inbox schrijft, ongeveer een uur werk — en
als het werk van de iPad ooit "even iets vastleggen" wordt in plaats van lezen, is dát het
eerste om te proberen, niet een app. Dat zou een nieuw besluit zijn, niet dit besluit
teruggedraaid.

---

## B54 — De prullenbak is omkeerbaar, en één ding eruit kan echt weg

**Genomen** op 16 augustus 2026. Een notitie kan de prullenbak in gesleept worden, alles
wat erin zit kan terug, en één notitie of map kan er definitief uit verwijderd worden.
Drie meldingen uit dagelijks gebruik die samen één ding zijn: de prullenbak was een plek
waar dingen alleen *heen* konden.

**Het slepen krijgt geen bevestiging**, en dat draait `drag.ts`' eigen redenering om. Die
zei: Verwijderen vraagt eerst, dus het ene gebaar zónder bevestiging mag niet het gebaar
zijn dat iets vernietigt. Dat argument stond overeind zolang er geen weg terug was — en
die is er nu. Wat een sleep doet is een `renameSync` naar `_trash`, precies wat Verwijderen
doet, en Terugzetten is de handeling met een naam die het ongedaan maakt. Een dialoog voor
elke sleep zou het trage pad zijn naar de enige map waar niets verloren gaat.

**Naar buiten slepen blijft geweigerd.** Dat is dezelfde zin als hierboven, andersom
gelezen: terugzetten is een bewuste handeling, geen bijproduct van de verkeerde rij
beetgepakt hebben. Alleen de prullenbak zelf is een bestemming, niet een map erbínnen —
Verwijderen legt alles plat neer, dus een diepere drop zou niets betekenen.

**Terugzetten vraagt waarheen, met de Inbox bovenaan.** De prullenbak is plat en er wordt
nergens bijgehouden waar iets vandaan kwam. Dat bijhouden zou kunnen — een JSON-bestand in
`userData`, B9 staat het toe — maar het is staat die stil verkeerd kan staan: een map die
buiten de app is verplaatst, een index die is herbouwd, en het "terug" wijst naar een plek
die er niet meer is. De kiezer is `MoveDialog`, die er al was, met één nieuwe eigenschap
(`preferred`) die de Inbox bovenaan zet zolang er niets getypt is. Zo is Enter meteen het
goede antwoord voor het gewone geval, en blijft het antwoord zichtbaar in plaats van
geraden.

**`deleteFromTrash` mag naast `emptyTrash` staan zonder B24 uit te vegen.** B24 zegt: er is
precies één plek in de app die iets voorgoed weggooit, en die vraagt eerst. Dat blijft de
strekking — het zijn er nu twee, met dezelfde wacht ervoor: `realpathSync` aan beide kanten,
en een weigering voor alles wat niet ín `<vault>/_trash` uitkomt. Ook het doelpad wordt
opgelost, wat `emptyTrash` niet hoeft: die werkt op `readdirSync`'s eigen ingangen, deze op
een pad dat over IPC binnenkwam. Een symlink *in* de prullenbak is net zo goed een uitweg
als een gesymlinkte prullenbak.

**Een map verplaatsen bestond nog niet**, en terugzetten is precies dat: een naam wijzigen
verandert nooit onder welke ouder een map hangt. `moveFolder` herhaalt `trashFolder`'s
weigeringen regel voor regel, zodat de renderer één verzameling blijft ontcijferen, met
drie verschillen die de hele handeling zijn: de *bron* mág in `_trash` zitten, de
*bestemming* niet (dat is `trashFolder`, en twee routes naar één handeling is hoe ze uit
elkaar gaan lopen), en een map kan niet in zichzelf. Een naambotsing wordt hier níet
geweigerd zoals bij `renameFolder`: daar had iemand de naam getypt en verwachtte hij dat
die genomen werd, hier houdt de map de naam die hij al had.

**De links worden gerepareerd, met één eerlijke beperking.** De handler is die van
`IPC.libraryRenameFolder` — dezelfde volgorde, dezelfde `linkingNotesUnder`/`targetsUnder`
vóór de verplaatsing en dezelfde twee schrijfrondes erna, nu uit één gedeelde functie zodat
B44 en B45 niet in twee kopieën uiteen kunnen lopen. Wat een link met het *oude* pad
(van vóór de prullenbak) betreft: die geneest vanzelf als de map teruggaat naar zijn
oorspronkelijke ouder, en blijft stuk als hij ergens anders heen gaat. Weggooien herschrijft
namelijk met opzet niets — "die notities zitten in de prullenbak" — dus er is niets
vastgelegd om tegen te repareren.

**Beide handelingen hebben een route buiten het rechtermuisknopmenu.** De regel uit
`CLAUDE.md` is niet decoratief: `--click-button` kan zo'n menu niet openen, dus wat er
alleen achter zit, bestaat voor de zelftest niet. Bij een map wisselen de drie
werkbalkknoppen om naar Terugzetten en Definitief verwijderen zodra je in de prullenbak
staat — net zoals `NoteList` daar + Nieuwe notitie voor Prullenbak legen wisselt, om
precies dezelfde reden: die drie knoppen zijn daar toch alle drie uitgeschakeld. Bij een
notitie doet het Acties-menu in de lezer hetzelfde, en dát menu hangt aan een gewone knop.

---

## B55 — Verweesde bijlagen zijn een plek, geen dialoogvenster

**Genomen** op 16 augustus 2026. Het scherm dat bijlagen toont waar geen notitie meer naar
verwijst is een rij in de zijbalk tussen Sneltoetsen en Prullenbak, en de uitkomst is
B47's bestandslijst in het notitiepaneel.

**Heen en weer, en dit is de derde stand.** Het begon in de voettekst van de boom, verhuisde
op 6 augustus 2026 naar een rij in Instellingen met het argument dat het een incidentele
handeling is en geen dagelijkse bestemming, en staat nu weer in de voettekst — maar als iets
anders dan de eerste keer. Toen was het een knop die een modaal venster opende met een eigen
raster, eigen voorbeelden en een eigen verwijderknop. Nu is het een `Selection`, net als
Taken: het notitiepaneel is de bestandslijst die B47 al tekent, de lezer is B47's
voorbeeldweergave, en verwijderen zit in het rijmenu van B54's batch. Er is dus niet iets
teruggedraaid maar iets weggehaald — een heel scherm dat hetzelfde deed als twee panelen die
er al stonden.

**De laad- en fouttoestand gaan mee, en dat is geen detail.** Dit is de enige bestandslijst
die een *zoekactie over de hele index* is in plaats van één `readdir`, en het scherm dat
hiervoor stond bleef op "Zoeken…" hangen om vier verschillende redenen tegelijk — waaronder
het volledig ontbreken van een `.catch`. Die toestanden zijn nu regels in het paneel, en de
herhaalpoging is de rij nog eens aanklikken.

---

## B56 — De ⧉ boven een ingesloten pdf-pagina gaat naar het systeem

**Genomen** op 16 augustus 2026. "Er is geen behoefte meer om pdf's in het losse venster te
openen" — de knoppenbalk boven een ingesloten pagina opent voortaan de systeemviewer, en
heet ook zo.

**B40's venster blijft bestaan**, bereikbaar via een gewone `[[bestand.pdf]]`-verwijzing en
via Openen in de bestandslijst. Wat verdwenen is, is de *reden* om er vanuit een notitie
heen te gaan: B43 tekende de eerste pagina en B46 gaf hem bladzijden, een Passend-keuze en
een paginavak. Wat het losse venster nog extra doet is zoomen, tekst selecteren en printen —
en dat is precies wat de systeemviewer ook doet, beter. De ⧉ wees dus naar de tussenstap.

**Het is niet alleen een etiket.** De knop riep `openWikiLink`, en die stuurt een `.pdf` per
definitie naar B40's venster (`attachment-route.ts`). Alleen het opschrift wijzigen zou een
knop opleveren die iets anders zegt dan hij doet — het soort verschil dat een half jaar later
als bug wordt gemeld. Er is een eigen kanaal bij gekomen dat via `resolveAttachment` gaat, met
dezelfde wacht tegen paden buiten de vault als al het andere dat een bijlage aanwijst (B28).

---

## B57 — Op Windows kijkt de wachter met polling, niet met `fs.watch`

**Genomen** op 16 augustus 2026, na twee meldingen die één oorzaak bleken te hebben:
permanent verwijderen van een *map* uit de prullenbak deed niets, en OneDrive kon een map
die op de andere machine hernoemd was niet bijwerken. Bestanden hadden nergens last van.

Die asymmetrie is de hele diagnose. chokidar's normale (native) handler roept `fs.watch`
aan **per map**, recursief; op een bestand opent hij nooit iets. Op Windows is dat een open
`FILE_LIST_DIRECTORY`-handle op elke gewone map in de vault, zolang de app draait — en die
draait de hele dag, dat is B2/B3. Windows weigert een map te verwijderen waar nog iets op
open staat, en de handle **verhuist mee**: `trashFolder` is een `rename`, en een handle
volgt het bestandsobject en niet het pad, dus hij ging mee de prullenbak in, hoe nadrukkelijk
`_trash` ook op de negeerlijst staat.

**Wat er nu gebeurt**: op `win32` krijgt `watch()` er `usePolling: true` bij, met een
interval van 2000 ms. chokidar gebruikt dan `fs.watchFile` (stat-polling) en `readdir`, en
houdt niets open. macOS blijft native kijken; daar blokkeert een watch-descriptor niets.

**Wat het kost, en waarom dat goedkoop is.** Polling betekent een periodieke stat-ronde over
de vault, de hele dag. Dat is echt werk op een grote vault. Het alternatief is een app die de
synchronisatie tegenhoudt van de map waarin hij zelf woont — en dan is een notitie die op de
ene machine wordt gemaakt op de andere niet te vinden, wat de app in de kern kapot maakt.
`04-bouwplan.md` vraagt dat een gesynchroniseerde wijziging binnen vijf seconden zichtbaar
is: 2000 ms polling plus 300 ms `awaitWriteFinish` past daarin. `awaitWriteFinish` blijft
staan en werkt in beide standen, dus de reden dat het er is (OneDrive schrijft een gesyncte
file in meerdere passes) verandert niet.

**Twee dingen die hier los van staan en toch nodig waren.** `rmSync` kreeg geen enkele
poging opnieuw mee — Node's standaard is `maxRetries: 0`, en juist de Windows-terugval voor
EBUSY/EPERM/ENOTEMPTY werkt alleen boven nul; `force: true` onderdrukt alleen ENOENT. Eén
kortstondige klem (OneDrive, de Verkenner, een virusscanner) was dus meteen een harde
fout. En die fout kwam nergens aan: de IPC-handler ving niets, de renderer riep de functie
als `void …` aan, dus de melding werd een onafgehandelde promise-afwijzing, het venster ging
dicht en de map stond er nog — precies wat "doet het niet" betekent. `emptyTrash` telt nu wat
niet weg wilde in plaats van bij het eerste bezwaar te stoppen, en beide antwoorden komen als
antwoord terug in plaats van als uitzondering.

**Niet gekozen**: op Windows één `fs.watch(vault, { recursive: true })` gebruiken. Dat houdt
maar één handle vast (op de vaultmap zelf) en kost niets aan polling, maar het betekent de
`add`/`change`/`unlink`-vertaling én een eigen `awaitWriteFinish` met de hand bouwen op het
pad dat de index juist houdt. Dat is nieuw werk op de plek waar een fout stil is; polling is
één regel met een bekende prijs.

---

## B58 — Geplakte `[[…]]`-tekst wordt meteen een knooppunt

**Genomen** op 16 augustus 2026. Wie **Kopieer link** op een bestand gebruikte en dat in een
notitie plakte, zag letterlijke tekst: `![[_attachments/foto.png]]`. Het plaatje verscheen pas
na het openen van een andere notitie en weer terug.

Het bestand was al die tijd goed. De tekens overleven het opslaan ongeschonden, en
`normalize-phrasing.ts` maakt er bij het *inlezen* een `wikiEmbed` van — vandaar dat het na
een rondje langs de schijf wél stond. Wat ontbrak was de andere kant: niets in de editor
claimde een platte-tekstplakking, dus ProseMirror's eigen parser zette er karakters neer.

**Nu draait er een tweede `transformPasted`-pass** (`paste-wiki.ts`), naast die van de
plaatjes, die elke `[[…]]` en `![[…]]` in geplakte tekst omzet in het knooppunt dat hij
noemt — met de markeringen van de tekst die hij vervangt, en niet binnen een codeblok, waar
tekens tekens horen te blijven.

**Dit heropent het "geen markdown-autoformat"-besluit niet.** `state.ts`'s `autoformat`
weigert markdown-spellingen uit principe, en `**vet**` plakt nog steeds als vijf tekens en
twee sterretjes. De `[[…]]`-familie is de uitzondering om twee redenen: het is de spelling
die deze app zélf op het klembord zet, en het is de enige waarbij de letterlijke tekst geen
soberder weergave is maar een kapotte — een afbeelding die er niet staat.

**De syntaxis staat niet twee keer opgeschreven.** `matchWikiSyntax` is de matcher van de
parser, geëxporteerd juist hiervoor: twee spellingen van één syntaxis is precies hoe een
plakking en een heropening het over dezelfde tekens oneens worden.

---

## B59 — Een weigering om te verwijderen noemt zichzelf

**Genomen** op 16 augustus 2026, nadat B57 was uitgebracht en de melding *woordelijk
hetzelfde* terugkwam: permanent verwijderen van een map uit de prullenbak doet het nog
steeds niet.

Dat is het belangrijkste feit in dit besluit. B57 was geen verkeerde diagnose — chokidar
hield werkelijk een handle per map open, en op Windows verhindert dat werkelijk een `rmdir`
— maar het was niet *deze* oorzaak. Twee keer achter elkaar een oorzaak aanwijzen die het
niet blijkt te zijn, is het moment om te stoppen met aanwijzen.

**Wat er nu gebeurt.** `trash-delete.ts` weigert niet langer met een zin die een oorzaak
beweert, maar met de code die het besturingssysteem zelf gaf *en het bestand dat weigerde*.
Een map die niet weg wil is bijna altijd één bestand daarbinnen dat niet weg wil, en
"`_trash/Alpha/offerte.pdf` — EBUSY" wijst ergens heen waar "deze map kon niet verwijderd
worden" dat niet doet. Het zoeken naar dat bestand (`findRemovalCulprit`) loopt alleen ná
een mislukte `rmSync`, dus het kost niets op het pad dat wel werkt.

**Twee echte reparaties zitten er wel in**, want dit is niet alleen diagnostiek.
`clearReadOnly` haalt het alleen-lezen-attribuut eraf vóór het verwijderen: `rmSync`
probeert het bij `EPERM` opnieuw, en opnieuw proberen helpt niet tegen een attribuut — het
is een seconde later nog steeds alleen-lezen, en een OneDrive-map is een plek waar bestanden
dat attribuut krijgen zonder dat iemand het zet. En de lezer laat het bestand los vóór de
verwijdering in plaats van erna, omdat de prullenbak doorbladerbaar is en B47 er een preview
in tekent.

**De tekst op het scherm beweert niets meer.** De vorige versie zei "iets anders heeft het
nog open", en dat is onwaar voor elke `EACCES`. Er staat nu dat het besturingssysteem
weigerde, met de code eronder. Een foutcode in een dialoogvenster is niet hoe deze app
praat; dat is hier verdiend, omdat de volgende melding met het woord van het
besturingssysteem zelf moet aankomen in plaats van met een derde gok.

**`--trash-probe=<pad>`** is de andere helft, en volgt `--thumbnail-probe` op de voet: loop
wat de verwijdering zou lopen en meld per bestand wat er waar van is. **Het verwijdert
niets** — het bewijsmateriaal is juist het punt bij de enige handeling zonder weg terug
(B24). Wat het níét kan zien staat in de uitvoer en niet in een voetnoot: een handle op een
*map* (precies waar B57 over ging), en buiten Windows sowieso niets over houders, omdat
vergrendeling daar adviserend is.

**Wat hier níét is gekozen**: nog een derde oorzaak aanwijzen en die repareren. Er staan
kandidaten open — OneDrive zelf, een viewer die een pdf openhoudt, een virusscanner — en
welke het is, is nu een vraag met een antwoord in plaats van een vermoeden.

## B60 — De bibliotheek krijgt een eigen systeembrede sneltoets

**Genomen** op 17 augustus 2026, naar aanleiding van "geen sneltoets om de notitiebrowser
te openen". Die was er wel — `Mod+O` — maar alleen in het opnamevenster, en dat is precies
het punt: vanuit Outlook, vanuit Word, vanuit de bibliotheek zelf bestond hij niet. Een
sneltoets die je alleen kunt gebruiken in het venster dat je juist wilde verlaten, is geen
sneltoets.

Dit **draait de eigen redenering van `shortcuts.ts` om**, en daarom staat het hier. Bij
`openLibrary` stond: "Window-local on purpose. A second global claim would be taken away
from every other app on the machine for something used a few times a day at most." Dat
argument klopt nog steeds — het weegt alleen anders zodra blijkt dat het alternatief "niet
bereikbaar" is in plaats van "bereikbaar via het andere venster".

**Wat er is gebouwd.** `settings.libraryHotkey` naast `settings.hotkey`, met dezelfde
opnameknop in Instellingen (één `HotkeyRow`, twee keer gebruikt) en een eigen regel in het
sneltoetsoverzicht. `Mod+O` blijft bestaan als de vorm binnen het opnamevenster.

**Eén functie registreert beide** (`registerGlobalHotkeys`), en dat is de enige echt
technische keuze hier. `globalShortcut` kan een claim niet teruggeven zonder te weten welke
het was; elk pad gebruikte `unregisterAll()`, en met een tweede sneltoets haalt dat stilletjes
de ander weg. Alles wat een toetscombinatie verandert — de start, `IPC.setHotkey`,
`IPC.setLibraryHotkey` — gaat daardoorheen, zodat wat deze app op de machine claimt op één
plek staat. De weigering noemt bovendien wélke van de twee bezet was; "een sneltoets is
bezet" laat de lezer zelf uitzoeken wat er niet meer werkt.

**Wat hier eerlijk bij hoort.** De standaard is `Ctrl/Cmd+Shift+B` ("browse"), en een
systeembrede claim wordt voor de duur van de sessie van elke andere applicatie afgepakt —
B18's afweging, ongewijzigd. Het klassieke Outlook bindt bijna elke `Ctrl+Shift+<letter>`
aan iets, en `B` is daar het adresboek. Dáárom is dit een instelling en geen constante: de
constante is alleen wat een machine krijgt waar nog niets is gekozen.

## B61 — Zelf starten opent de bibliotheek; starten bij aanmelden blijft stil

**Genomen** op 17 augustus 2026. De app starten via zijn snelkoppeling zag eruit als "er
gebeurt niets". Dat was niet zo — het pictogram in de systeembalk kwam, het opnamevenster
werd verborgen opgebouwd — maar een bewuste start die geen enkel venster laat zien, is van
buiten niet te onderscheiden van een start die mislukt is.

**De omkering is klein en de reden is de asymmetrie.** Bij aanmelden is stil zijn juist
goed: dat is het hele idee van B2/B3, het proces hoort er de hele dag te zijn en niemand
vroeg op dat moment om een venster. Elke andere start is een handeling van een mens, en die
verdient een antwoord.

**Er was geen enkel signaal om die twee uit elkaar te houden**, en dat is de eigenlijke
bevinding. `setLoginItemSettings` werd aangeroepen met alleen `{ openAtLogin }`, dus de
Run-sleutel op Windows droeg een kale opdrachtregel. Nu staat `--login` erop
(`applyLoginItem`, één functie — de systeembalk zette de aanmeldstart eerder zelf en zou het
argument bij de eerste klik weer kwijtraken), en macOS levert daarnaast
`getLoginItemSettings().wasOpenedAtLogin`. Beide worden gelezen: een sleutel die door een
oudere versie is geschreven draagt het argument pas na een herschrijving.

**Opnieuw starten terwijl de app al draait is dezelfde handeling** en krijgt hetzelfde
antwoord: `second-instance` stelt de vraag opnieuw, over de argumenten die de nieuwe start
meebrengt, en toonde eerder altijd het opnamevenster. Op macOS gaat dat via `activate`, want
een `LSUIElement`-app zonder dock-pictogram krijgt geen tweede instantie te zien.

`shouldOpenLibraryAtLaunch` is een pure functie in `launch-options.ts`, apart van de start
die hem uitvoert, zodat beide ingangen dezelfde vraag stellen. De meet- en probepaden staan
er expliciet in en niet bij de aanroep: die eindigen in `app.exit()`, en een venster dat vóór
een latentiemeting opkomt is precies het soort ding dat in de getallen terechtkomt.

## B62 — Geen genummerde koppen

**Genomen** op 17 augustus 2026, als antwoord op de vraag of opsomming, nummering of taken
te combineren zijn met koppen: "1. Titel (kop 1), 1.1 Subtitel (kop 2), 1.1.1 Subsubtitel".
Het antwoord is **nee**, en dat is het waard om vast te leggen, want de vraag komt terug.

**Wat wél kan en al werkte:** een kop *onder* de eerste regel van een lijstitem.
`listItem` is `paragraph block*`, dus `1. Titel` met daaronder `## Subtitel` is geldig en
komt byte-identiek terug.

**Wat niet kan:** een kop als eerste inhoud van een item. `from-mdast.ts` zet er een lege
alinea vóór om de inhoudsexpressie te vullen, de serializer schrijft dan een leeg item met
een ingesprongen kop eronder, en bij het teruglezen ontsnapt de kop uit de lijst en verdwijnt
de lege lijst. Dat is een document dat structureel niet meer het geschrevene is — precies wat
`03-markdown-dialect.md` §8 verbiedt. `test/limitations.test.ts` pint beide vast.

**Afgewezen: de nummers zelf verzinnen.** Twee vormen, allebei slechter dan niets doen.
Alleen op het scherm nummeren (CSS-tellers) betekent dat de nummers verdwijnen zodra de
notitie in Outlook wordt geplakt — en dat is waar deze notities heen gaan. De nummers in de
koptekst schrijven maakt de app eigenaar van het hernummeren van elke kop in elke notitie bij
elke bewerking, en laat handgetypte nummers botsen met verzonnen nummers. Geen van beide
verdient de gereedschapskist die eronder hoort.


## B63 — Zoeken binnen één notitie is een decoratie en verder niets

**Genomen** op 18 augustus 2026. Er was geen enkele manier om in de geopende notitie te
zoeken. `IPC.librarySearch` beantwoordt *welke* notities, uit de index; *waar in deze ene*
werd door niets beantwoord, dus een lange vergadernotitie moest doorgelezen worden. `Ctrl+F`
is daarvoor op beide platformen de toetscombinatie van élke applicatie, en dus de enige die
niemand uitgelegd hoeft te krijgen.

**Er wordt niets geschreven.** Elke treffer is een `Decoration`, de balk staat buiten het
bewerkbare document, en langs de treffers lopen verstuurt geen enkele transactie. Daarmee is
er geen B6-vraag (er komt niets bij de serializer) en geen B10-vraag (een notitie openen en
doorzoeken laat het bestand ongemoeid, bytes én mtime). Onder `Xvfb` gemeten: hash en mtime
van de doorzochte notitie waren achteraf ongewijzigd.

**`findMatches` is een zuivere functie**, apart getest — dezelfde scheiding die
`editor-keys.ts` aanbrengt tussen `editorKeyIntent` en de Electron-gebeurtenis eromheen. De
tekst wordt **per tekstblok** verzameld, niet per tekstknoop en niet over het hele document.
Per tekstknoop breekt elke treffer die over een markgrens loopt: `**offer**te` zijn twee
knopen en moet `offerte` opleveren — precies het geval dat een lezer niet kán zien en dus als
fout meldt. Over het hele document zou een treffer van het einde van de ene alinea naar het
begin van de volgende kunnen lopen, en dat markeert iets wat op het scherm niet één ding is.
Een `hardBreak` sluit een reeks af om dezelfde reden; een inline-atoom wordt één teken dat
niemand typt.

**Afgewezen: `prosemirror-search`.** B42 en B49 wezen al een ProseMirror-pakket af waarvan
het model rijker is dan dit schema; hier is het bezwaar kleiner maar van dezelfde vorm — dat
pakket brengt vervangen, reguliere expressies en een eigen toetsenkaart mee die deze app niet
gebruikt, ín de bundel met het latentiebudget. `findMatches` is veertig regels.

**Afgewezen: zoeken én vervangen.** Vervangen is een tweede functie, een destructieve, en het
zou de enige plek in de app zijn die veel regels tegelijk verandert zonder bevestiging en
zonder te benoemen wat er geraakt wordt — B24's argument, een niveau lager.

**Platte DOM, geen React**, net als `slash-menu.ts` en om diens tweede reden: de plugin gaat
één keer in `createEditorState` en beide vensters hebben de functie zonder dat één van beide
er iets van hoeft te weten. Het opnamevenster — waar notities werkelijk geschreven worden, en
dat binnen 80 ms op het scherm moet staan — krijgt het er gratis bij. Op 18 augustus 2026
onder `Xvfb` in dát venster bevestigd, niet alleen in de bibliotheek.

**Langs de treffers lopen verandert de selectie niet.** Het schuift de DOM-knoop van de
actieve decoratie in beeld. Een selectiewijziging zou een stap in de geschiedenis zetten —
zoeken is niets om ongedaan te maken — en zou met het invoerveld om de focus vechten. De
cursor wordt precies één keer verplaatst, bij het afsluiten, want landen op wat je gevonden
hebt is wat zoeken bruikbaar maakt om te bewerken in plaats van alleen om te kijken.

De kleur is een **derde**, opzettelijk geen tint van de twee bestaande: `==highlight==` is een
mark die de notitie draagt en `--task-highlight` is de Takenweergave die naar een regel wijst.
Een treffer die op één van beide lijkt is de verwarring die B32 al eens opgeruimd heeft. En
de actieve treffer draagt **beide klassenamen in één selector**, nooit alleen de modifier: bij
één klasse elk verliezen ze op bronvolgorde, wat B48 en `.overlay` allebei al een keer gekost
heeft.

## B64 — `Ctrl+F` betekent twee dingen, en de plugin is wat dat beslist

**Genomen** op 18 augustus 2026, samen met B63. In de bibliotheek zijn er twee zoekopdrachten:
de zoekbalk over de hele vault, en zoeken binnen de geopende notitie. Ze verdienen allebei
`Ctrl+F`, want dat is in beide gevallen wat een mens intikt. Dus zijn het **twee vermeldingen
in het register** met dezelfde spelling en een verschillende `where`: `find` (`editor`) en
`searchVault` (`library`). Het hulpoverzicht drukt in de bibliotheek beide regels af, en dat
is met opzet de duidelijkste beschikbare formulering van een toetscombinatie die twee dingen
betekent.

**Het ontwerp klopte en de uitvoering niet, en alleen het draaien liet dat zien.** De
redenering was dat `outlookKeymap` — dat alleen de `editor`-vermeldingen bindt — de toets
opeet zodra de cursor in een notitie staat, zodat de vensterluisteraar hem alleen daarbuiten
ziet. Dat is niet wat er gebeurt: een keymap-commando dat `true` teruggeeft laat ProseMirror
`preventDefault()` aanroepen en verder niets, dus de toets borrelde gewoon door naar
`Library.tsx` en **beide vuurden**. De balk ging open en de cursor werd er meteen weer uit
gehaald en in de zoekbalk gezet. Elke test slaagde; de twee wonen in verschillende modules en
geen van beide weet van de ander. Dezelfde familie als B36's slash en B40's ontbrekende
`corsEnabled` — een eigenschap van de looptijd, niet van deze broncode.

`find-in-note.ts`'s `handleKeyDown` houdt de toets tegen bij de editor, en die ene regel is
wat de scheiding echt maakt. Bewust smal: alleen deze toetscombinatie, en alleen tegengehouden
— er wordt `false` teruggegeven zodat de keymap het commando nog steeds uitvoert, waardoor de
binding op precies één plek gedefinieerd blijft. Elke toets die de keymap afhandelt laten
tegenhouden zou de algemene reparatie zijn, en een veel grotere verandering in hoe elke andere
toetscombinatie in de app zich gedraagt.

**Dat is dezelfde fout als de Escape-melding uit dezelfde partij**, en daarom staat het hier
en niet alleen in een commentaar: `preventDefault` sluit een gebeurtenis niet af.
`Help.tsx`, `ContextMenu.tsx` en `slash-menu.ts` hielden Escape tegen noch af, en die ene
druk sloot dus het paneel én wierp de focus uit de notitie in de notitielijst. De regel die
beide antwoorden is: **wie een toets afhandelt, houdt hem tegen — en een vensterluisteraar
vraagt de gebeurtenis waar hij vandaan komt, niet waar de focus geëindigd is.**


---

## B65 — De `#tags` uit de tekst gaan mee de frontmatter in

**Genomen** op 19 augustus 2026. Dit **herziet de tweede helft van B19**: die zei dat de twee
plekken waar een tag kan staan — `tags:` in de frontmatter en `#tag` in de lopende tekst —
nooit naar elkaar toe schrijven. Dat blijft kloppen voor de *lezer* (`summarise()` voegde ze
al samen voor de lijst), maar niet meer voor het *schrijven*: bij het opslaan worden de tags
uit de tekst in `tags:` bijgeschreven.

**De aanleiding is dat de kop over de notitie loog.** `openNote` gaf alleen
`frontmatter.tags` terug, dus een notitie waarvan alle tags in de tekst staan — precies de
vorm die een in Obsidian geschreven vault heeft — opende met een **leeg** tagveld, terwijl de
lijst ernaast er drie liet zien. Er was ook geen enkele manier om die tags vanuit de kop te
zien of te beheren.

**De prijs is echt en is bewust aanvaard, en dat hoort hier te staan en niet in een
voetnoot**: de eerste echte bewerking van een notitie met tags in de tekst herschrijft haar
frontmatter. Dat is B10's OneDrive-argument van de verkeerde kant benaderd. B10 zelf blijft
onaangetast en dat is de grens: **openen schrijft nog steeds niets** — `openNote` leest
alleen, en `test/note-files.test.ts` bewaakt dat ongewijzigd. Het kost bovendien één schrijf
per notitie, niet één per opslag: zodra de tag er staat, is de volgende opslag weer een
niets-doen (de bytevergelijking in `saveNote` is onaangeroerd).

**Wat afgewezen is.** *Alleen tonen, niet schrijven* — de chips wel, de hoisting niet. Dat
lost de leugen op zonder ook maar één byte te kosten, en het is wat B19 zou hebben gezegd;
het is afgewezen omdat de vraag juist was of een tag uit de tekst meetelt als een tag van de
notitie, en het antwoord daarop is ja. En *de kop schrijft in de tekst* — een tag die in het
veld wordt getypt als `#tag` onderaan de notitie bijzetten. Dan is er één plek, maar het veld
verandert de zin, en een kopveld dat de lopende tekst bewerkt is een verrassing die niemand
gevraagd heeft.

**Herkomst is de hele reparatie, en zonder haar is een tag onverwijderbaar.** Na één opslag
staan de handmatige en de bijgeschreven tags ononderscheidbaar in `tags:`. Toonde het veld
ze allemaal, dan zou `klantx` uit `tags:` blijven staan lang nadat de `#klantx` die hem daar
bracht uit de zin verdwenen was — geschreven door een veld dat hem elke keer terugzet. Dus:
`manualTags` (`src/markdown/note-tags.ts`) trekt de tags van de tekst van de gedeclareerde
af, en wat overblijft is wat het veld bezit en als enige schrijft. Een tag die op beide
plekken staat, hoort daarmee bij de tekst — hem daar weghalen haalt hem overal weg. `OpenedNote`
draagt de twee gescheiden over (`tags` en `bodyTags`), en de tekst-tags staan naast het veld
als chips die je niet kunt bewerken, met een tooltip die zegt waar ze wél weggaan.

**Eén functie, twee schrijvers.** `mergeTags` en `bodyTagsOf` staan in `src/markdown/`, buiten
Electron, en worden aangeroepen door `vault-io.ts`'s `saveNote` én `capture-store.ts`'s
`buildFrontmatter` — de twee die volgens hun eigen commentaar identiek moeten blijven.
`bodyTagsOf` leest de tags van de **geserialiseerde tekst**, niet van een wandeling door het
ProseMirror-document: `summarise()` leest ze van de bytes op schijf, en twee lezingen van
dezelfde syntaxis is precies hoe twee antwoorden op één vraag uit elkaar gaan lopen. Dat kost
één stringify per opslag, wat niets is naast een ontdubbeling van 800 ms — en het is de reden
dat de chips in beide vensters op de bestaande debounce worden herrekend en **nooit per
aanslag**: het opnamevenster heeft een budget van 16 ms.

---

## B66 — Het tagveld vult aan uit de tags die de vault al heeft

**Genomen** op 19 augustus 2026, naast B65. `HeaderBlock.tsx` betoogde uitgebreid dat het tag-
en het personenveld **met opzet** geen aanvulling hadden. Twee van die drie bevindingen staan
nog overeind en bepalen de vorm: een `<datalist>` sluit niet bij een tweede klik — Chromium's
gedrag, hier niet bij te sturen — dus is dit een echte combobox van gewone elementen; en
`remembered.ts`'s lijst per machine was de verkeerde bron, dun en persoonlijk waar de vault de
echte lijst heeft.

**De derde bevinding is verlopen.** Die zei dat de lijst van de vault serveren een scan op het
opnamepad zou zetten, en dat was waar vóór fase 5. De index bestaat nu, `startScan` draait bij
het opstarten, en `facets()` is een gewone lezing daarvan — dezelfde die het Tags-filter van
de bibliotheek al doet. `IPC.tagSuggestions` geeft daar de `tags`-helft van terug, en staat
op het bovenste niveau naast `linkCandidates` om diens reden: beide vensters vragen erom, en
die groepering gaat over *welk venster*, niet over welke functie.

**Er wordt pas gevraagd bij de eerste focus van het veld**, nooit bij het opstarten. Dat is
geen zuinigheid: dit onderdeel wordt in het opnamevenster getekend lang voordat de sneltoets
het laat zien, en een IPC-heen-en-weer op dat pad is precies waartegen de 80 ms gemeten wordt.

**Personen krijgen het niet**, en dat is een besluit en geen vergetelheid: een naam komt niet
uit een gesloten verzameling zoals een tag, en de helft ervan aanbieden is slechter dan niets.

Twee dingen die makkelijk stuk te "repareren" zijn. **Het aanvullen gaat over het woord waar de
cursor in staat**, nooit over het hele veld — het veld houdt een lijst vast, en aanvullen van
het geheel breekt zodra er een tweede tag getypt wordt. En **Escape roept `stopPropagation()`
aan**: `preventDefault` sluit een gebeurtenis niet af, en zonder dat draait dezelfde druk ook
de Escape-tak van `Library.tsx` en springt de focus de kop uit — één druk, twee dingen, de
fout die de partij van 18 augustus 2026 overal elders wegnam (B64).

**Wat de notitie al heeft, wordt niet aangeboden** — het veld én de tekst. Dat de tekst-tags
er niet in staan ziet eruit als een omissie en is het niet: B65 schrijft ze bij het opslaan
tóch in de frontmatter, dus aanvullen tot zo'n tag zou letterlijk niets schrijven, terwijl de
chip die zegt dat de notitie hem heeft een centimeter verderop staat. De eerste versie bood ze
wel aan, en dat was dezelfde tag twee keer op één regel.


---

## Open punten

| Punt | Wanneer duidelijk |
|---|---|
| ~~Mag een ongetekende Electron-app draaien op de werkmachine?~~ | Ja — bevestigd op 25 juli 2026 |
| Is Power Automate beschikbaar? | Fase 6 — terugval staat klaar, blokkeert niets |
| Haalt Windows het latency-budget met de editor erin? | Nu — drie losse metingen (112/77/52 ms) zijn te weinig; zelftest daar draaien |
| Hoeveel geheugen kost het residente proces in de praktijk? | Fase 1 — raakt B2 |
| Hoe hardnekkig is de `mso-list`-reconstructie? | Fase 4 — het grootste onbekende stuk werk |
| Werken de kiezer (B41), het tabelraster (B42), de PDF-lezer (B40), de ingesloten pagina (B43) en de tabelwerkbalk ook in het *opnamevenster*? | Nu — alle vijf zijn onder `Xvfb` in de bibliotheek bevestigd (12 en 13 augustus 2026); het opnamevenster heeft nog steeds geen testharnas, zie `TEST-PROTOCOL.md` |
| Tekent het opnamevenster een bijlage werkelijk? | Nu — CSP en NodeView staan er, alleen nooit met een echte afbeelding gezien; zie `TEST-PROTOCOL.md` |
| ~~Levert `nativeImage.createThumbnailFromPath` op macOS en Windows echt een PDF-eerste-pagina op?~~ | Vervallen — B36 stelt die vraag niet meer: pdf.js tekent de pagina, en dat is op 7 augustus 2026 onder `Xvfb` werkend gezien, op precies dezelfde Chromium die de verpakte app meelevert. Wat een mens nog moet nakijken staat in `TEST-PROTOCOL.md` §4.5 |
| Verschijnt de eigen, knopvrije melding van het opnamevenster echt bij een externe wijziging? | Nu — het pad in de bibliotheek is op 7 augustus 2026 uitputtend bevestigd onder `Xvfb` (schoon/vuil/verwijderd, en geen valse balk bij eigen schrijfacties); het opnamevenster zelf nog niet, zie `TEST-PROTOCOL.md`, B31 |
| ~~Blijft het bij twee notitietypen?~~ | Ja, maar als etiket — beantwoord op 28 juli 2026, B20 |
| Werken de celselectie (B49), het webplaatje (B50) en het `/`-menu (B51) ook in het *opnamevenster*? | Nu — alle drie zijn op 14 augustus 2026 onder `Xvfb` in de bibliotheek bevestigd; het opnamevenster heeft nog steeds geen testharnas, zie `TEST-PROTOCOL.md` |
| Hoe voelt een gesleepte celselectie op een echt beeldscherm? | Nu — de rechthoek, het wissen en de knoppenbalk zijn gedreven en gemeten, maar hoe het slepen zelf aanvoelt kan een script niet beoordelen |
| **Waarom deed Ctrl+Tab niets op Windows?** | Onbekend, en dat hoort hier te staan. Op Linux is op 16 augustus 2026 met echte XTEST-toetsen gemeten dat de toetscombinatie gewoon aankomt en dat het wisselen werkt; de binding spelt `Ctrl` letterlijk, dus het is niet de platformvergelijking. De claim staat nu in `before-input-event`, het vroegste punt in het venster — een reparatie zonder vastgestelde oorzaak. De verdwenen Windows-menubalk (zelfde venster, zelfde partij) is de andere kandidaat. Te bevestigen op Windows, `TEST-PROTOCOL.md` §22 |
| **En waarom deed Ctrl+Shift+T niets op Windows?** | Nog steeds onbekend, en de melding kwám ongewijzigd terug — de reparatie van 17 augustus 2026 (geclaimd in `before-input-event`, `editor-keys.ts`, ook in het opnamevenster) heeft hem niet weggenomen. Daarmee is dit dezelfde plek als B57/B59: een diagnose die zijn eigen melding overleeft, is onvolledig geweest. Dus is er op 18 augustus 2026 twee dingen gedaan. `paragraph`'s precedent — een tweede toetscombinatie ernaast, `Mod-Shift-D`, op Linux met echte XTEST-toetsen bevestigd: een gewone alinea wordt een echt `<li data-checked="false">`, de `D` bereikt de pagina niet terwijl een niet-geclaimde `Ctrl+Shift+L` dat wel doet. En **`--key-probe`** (`key-probe.ts`), dat elke toets logt die een venster krijgt aangereikt, vóórdat iets hem claimt — zodat de volgende ronde met het antwoord van het besturingssysteem aankomt in plaats van met een derde gok. **Geen regel voor een druk betekent dat de toets het venster nooit bereikt heeft**, en dat is wat de app zelf niet kan zien; het staat in de kop van het logbestand. `TEST-PROTOCOL.md` §26 |
| **Wát houdt die map op Windows vast?** | Onbekend, en dat hoort hier te staan. B57 haalde de eigen handle van de app weg en de melding kwam ongewijzigd terug, dus de watcher was het niet (alleen). Sinds B59 noemt de weigering de code en het bestand, en `--trash-probe` loopt de map na — de eerstvolgende melding hoort de vraag te beantwoorden in plaats van te verplaatsen. `TEST-PROTOCOL.md` §24 |
| **Is de mappenklem op Windows weg, en wat kost het pollen daar?** | Nu — B57 is op Linux gemeten (de prullenbak neemt en verwijdert een map, een geklemde map antwoordt in plaats van te weigeren), maar de klem zelf is een Windows-kernelding dat hier niet na te maken is. Ook de prijs van een stat-ronde per twee seconden op een echte, grote OneDrive-vault is alleen daar te voelen. `TEST-PROTOCOL.md` §23 |
| Opent de vaultkiezer bij een verse installatie op een machine met precies één zakelijke OneDrive? | Nu — het pad is met een nagebootste OneDrive gemeten (zonder de reparatie geen dialoog en een aangemaakte map, met de reparatie een echt venster), maar niet op een echte werkmachine, `TEST-PROTOCOL.md` §22 |
