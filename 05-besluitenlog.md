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

## B67 — Een map toont hoeveel notities en hoeveel openstaande taken erin zitten

**Genomen** op 19 augustus 2026, uit dagelijks gebruik. De mappenboom telde al notities; wat
ontbrak was de vraag die je aan een projectmap werkelijk stelt — *staat hier nog werk?* Het
badge leest nu `[# notities] / [# openstaande taken]`.

**Alleen voor een map met notities.** Een map zonder notities heeft nooit een badge gehad, en
dat blijft zo: er is dan niets om het getal aan op te hangen. En **er wordt niet opgeteld naar
boven** — een map telt wat er *in die map zelf* staat, precies zoals `noteCount` dat altijd al
deed. Zouden de taken wel opgeteld worden en de notities niet, dan telden de twee helften van
één badge verschillende notities, en dat is erger dan een getal missen.

**Het getal komt uit de index, nooit uit een wandeling over de map** — B26 in het klein. De
kant-en-klare tabel is `note_tasks`, gevuld door `buildRecord` bij een scan of een
watcher-herindexering; hem opnieuw uitrekenen zou betekenen dat elke notitie van een map bij
het openen van de bibliotheek opnieuw geparseerd wordt, en dat is de hoofddraad-stilstand van
470–535 ms waarvoor de scan een worker heeft gekregen. `openTaskCountsByFolder` groepeert per
notitie in SQLite en vouwt daarna op de map in JavaScript: SQLite heeft geen `dirname`, en die
regel met `instr`/`substr` naschrijven zou een tweede spelling zijn van iets wat elders al
precies één keer staat. De koppeling met `notes` is niet decoratief — een rij waarvan de
notitie niet meer in de index staat mag niet meetellen, of het badge belooft taken die het
Taken-scherm niet toont.

**Het is een eigen IPC-aanroep en geen veld op `IPC.libraryTree`**, en dat is de kern. De boom
is één `readdir` en moet meteen antwoorden — "een map openen wacht nooit op een scan" is de
regel die `vault-scan.ts` zelf opschrijft — terwijl dit achter `ensureScanned` zit. Eén aanroep
van de twee maken zet het bladeren dus achter de scan, voor een getal. De boom komt eerst, het
tweede getal komt erna, en `folder-tasks.ts` voegt ze samen op het pad waar beide kanten het
al over eens zijn.

**Daarom is "nog niet geteld" iets anders dan "niets open".** `openTasks` is *afwezig* tot de
index geantwoord heeft, geen nul: anders beweert elke map een halve seconde lang dat er geen
werk ligt, en dat is precies de mededeling waar het badge voor gemaakt is. Zodra er wél geteld
is krijgt een schone map een echte `0` te zien — het badge is een paar of het is niets, zodat
een map die klaar is niet te verwarren is met een map die nog geteld wordt.

**Het volgt een vinkje zonder er iets van te weten.** Een aangevinkt vakje is een opslag, en
een opslag is wat `library:refresh` opwerpt; de watcher werpt hem daarna nog eens op als hij
diezelfde schrijfactie ziet, waarmee de telling op de bijgewerkte index landt. Een mislukte
verversing laat staan wat er stond, dezelfde regel die het scherm voor niet-gekoppelde
bijlagen geleerd heeft.

Twee klassenamen op de tweede CSS-regel (`.branch-tasks.branch-tasks-open`), niet één. Bij één
per stuk winnen ze op volgorde in het bestand in plaats van op specificiteit, en dat is precies
hoe B48's verborgen chip en het dimmen van de menu's allebei uitgeleverd zijn; `jsdom` heeft
geen cascade om in te verliezen, dus `test/styles-branch-tasks.test.ts` leest de regel zelf.

---

## B68 — Een net begonnen notitie kan weggegooid worden, en gaat dan naar de prullenbak

**Genomen** op 19 augustus 2026, uit dagelijks gebruik. Het opnamevenster schrijft de notitie
800 ms na de eerste toetsaanslag naar schijf, en *iedere* uitgang legt hem vast: het kruisje,
Ctrl+Enter, Escape, het venster verlaten, afsluiten. Een notitie die per ongeluk begonnen was,
was daarmee een notitie die bestond — en de enige manier om ervanaf te komen was hem daarna in
de bibliotheek opzoeken en daar verwijderen. Er is nu een knop **Weggooien** in de statusbalk.

**Hij gaat naar `_trash`, niet uit het bestaan.** Dat is precies wat het toelaat om er geen
bevestiging voor te zetten: B54's eigen redenering, die ook is waarom een notitie op de
prullenbak slepen niets vraagt. Een dialoog staat in voor een weg terug die er niet is, en die
weg terug heet hier Terugzetten. De regel dat er maar twee plekken in de app zijn die iets
werkelijk vernietigen (`emptyTrash` en `deleteFromTrash`, B24) blijft dus onaangeroerd — dit is
er geen derde.

**Alleen voor een gloednieuwe notitie.** Een notitie die de bibliotheek aan dit venster heeft
overgedragen is niet van dit venster om weg te gooien: die staat in de bibliotheek, waar Delete
al bestaat en al de goede vragen stelt. De knop wordt daar niet getekend, én
`CaptureWriter.discard` antwoordt `null` voor zo'n sessie — twee onafhankelijke sloten op één
deur, want een van de twee kan door een toekomstige verbouwing wegvallen.

**De volgorde is het hele werk.** `discard()` wisselt de sessie in voordat het antwoordt —
`finish()`'s reden precies: een toetsaanslag die binnenkomt terwijl dit loopt hoort bij de
*volgende* notitie. Daardoor draait het `writer.finish()` dat elke sluiting uitvoert
(`hideCaptureWindow` → `onHide`) op een lege sessie, en `writeSession` antwoordt `NOTHING` bij
een `null`-payload in plaats van de notitie terug te zetten die zojuist is weggehaald. Zonder
die wissel zet de sluiting het bestand er meteen weer neer, en dat is een bug die alleen dóór
het te draaien te vinden is — vandaar dat `test/capture-writer.test.ts` de `finish()` erná
uitschrijft in plaats van hem te veronderstellen.

**Wat het níet doet is de schrijfactie overslaan die al onderweg is.** `writeSession` kiest de
bestandsnaam bij de eerste schrijfactie en zet hem op het sessieobject, dus een weggooiing die
antwoordde vóór die schrijfactie klaar was zou `null` melden voor een bestand dat een tik later
verschijnt — een weesbestand dat niemand terug kan vinden. De wachtrij wordt uitgewacht; dat
kost in het slechtste geval één debounce en maakt het antwoord waar.

`capture-store.ts` doet het weggooien zelf niet: die module schrijft een sessie, en waar een
notitie heen gaat als hij verwijderd wordt is een regel van `vault-io.ts` — daar staat er één
van (B27/B54), en een tweede ernaast is hoe twee antwoorden op één vraag uit elkaar gaan lopen.

---

## B69 — De notitielijst toont per notitie `[open] van [totaal]`

**Genomen** op 19 augustus 2026, uit dagelijks gebruik, en het directe vervolg op B67: de map
zegt sinds gisteren dat er werk ligt, de rijen erin zeiden niet in wélke notitie. Onder de datum
staat nu `2 van 5`, rechts uitgelijnd.

**Personen blijven staan.** De melding bood aan om de "Wie"-regel ervoor op te geven; dat is
overwogen en niet gedaan. Een vergadernotitie die stilletjes ophoudt te zeggen wie erbij was is
een slechtere ruil dan één extra regel — dus staan ze naast elkaar op één rij, personen links
en de telling rechts ertegenaan. Het getal staat bewust *niet* naast de datum: die kolom is waar
de sortering op staat en leest als één kolom door de lijst heen, en een tweede getal daarin zou
elke keer van de datum onderscheiden moeten worden.

**Twee getallen, geen één.** `0 van 5` is een notitie waarvan het werk klaar is; een notitie die
nooit een vakje had zegt niets. Alleen `totaal` houdt die twee uit elkaar, en dat verschil is de
hele mededeling: grijs voor "klaar", de accentkleur voor "hier ligt nog wat".

**Afwezig is niet nul** — B67's regel een niveau lager, en om B67's reden: de rijen komen van
een `readdir` en de telling komt van achter de indexscan, dus een rij mag nooit even kunnen
beweren dat een notitie schoon is terwijl het antwoord nog onderweg is.

**Het komt uit dezelfde query als het mapbadge.** `openTaskCountsByPath` is nieuw;
`openTaskCountsByFolder` is herschreven tot de vouwing daarover in plaats van een tweede query.
Een map die zegt dat er twee open staan met daaronder rijen die het oneens zijn is het soort
fout dat je wegontwerpt in plaats van test — één vraag, één antwoord. Het is wel een tweede
IPC-aanroep, om B67's reden: één aanroep van de twee zou het bladeren van een map achter de scan
zetten.

Het kan niet uit `NoteSummary` komen. `summarise` leest de frontmatter en de eerste regels
zonder ooit een document te bouwen — bewust, dat scheelt 1,51 ms per notitie tegen 0,09 ms — en
ziet dus geen enkel taakvakje.

Twee klassenamen op de tweede CSS-regel (`.note-tasks.note-tasks-open`), niet één, om precies
B67's reden; `test/styles-note-tasks.test.ts` leest de regel zelf.

**Herzien op 20 augustus 2026, uit dagelijks gebruik: alleen wat openstaat, en niets als er
niets openstaat.** Er staat nu `Taken: 2`, en een notitie waarvan alle vakjes zijn afgevinkt
tekent helemaal niets meer. Dat draait de "twee getallen, geen één"-alinea hierboven om, en het
argument dat hem vervangt is dit: het getal is een oproep om iets te doen, een notitie die klaar
is heeft die niet, en een kolom getallen die grotendeels zeggen dat er niets ligt is een kolom
die niet meer gelezen wordt. Het totaal is niet verdwenen maar één hover ver — de `title` spelt
`2 / 5` nog steeds uit, wat meteen `tree.openTasks` de enige plek houdt waar die woorden staan.

**Afwezig is nog steeds niet nul**, en om precies dezelfde reden: dat de twee nu hetzelfde
tekenen is een gevolg van deze regel, geen samenvoeging van de twee toestanden.

**En de telling schuift een rij omhoog als er niemand naast staat.** `.note-bottom` bestaat om
personen links en de telling rechts te zetten; zonder personen was het een rij met één getal
erin. Die rij wordt nu helemaal niet getekend en de telling staat rechts op de *tekstregel*.
Personen blijven staan waar ze stonden, dus de alinea hierboven geldt onverkort — de regel gaat
over Wie, niet over tags, die nooit een rij met de telling deelden. De grijze variant en de
`.note-tasks-open`-klasse konden ermee weg: er is nog één toestand om te tekenen.

---

## B70 — De cursorpositie blijft bewaard zolang het bibliotheekvenster open is

**Genomen** op 19 augustus 2026, uit dagelijks gebruik. `setDoc` vervangt de hele
`EditorState` — dat moet, anders lekt de ongedaan-maken-geschiedenis van de ene notitie in de
andere — en gooit daarmee ook de cursor weg. Een notitie verlaten en terugkomen begon dus altijd
bovenaan, wat in een lange notitie betekent dat je je plek zelf terug moet zoeken.

**In het geheugen en nergens anders.** Niet in het notitiebestand: een notitie openen schrijft
niets (B10), en een cursorpositie is niets om via OneDrive naar de andere machine te dragen —
het is geen eigenschap van de notitie maar van dit kijkmoment. Ook niet in `index.sqlite`: dat
is een afgeleide cache die `migrate()` bij een schemaverhoging weggooit, dus de verkeerde plank
voor iets wat juist niet af te leiden is. En bewust ook niet in `settings.json`: dat is wat
gevraagd is — binnen één zitting heen en weer lopen — en een bestand op schijf zou een tweede
vraag beantwoorden die niemand gesteld heeft.

**Het neemt geen focus.** `setSelection` roept `focus()` niet aan. Een notitie openen uit de
lijst laat de focus op de aangeklikte rij staan, en dat blijft zo; wat verandert is wáár de
cursor staat te wachten zodra je met Tab of met een klik de notitie in gaat. Een herstelde
cursor die de focus meeneemt zou een tweede gedrag zijn waar niemand om gevraagd heeft.

**Een taak-ordinaal wint.** Een rij aanklikken in het Taken-scherm noemt een bestemming ín de
notitie; een cursor die van een vorig bezoek is blijven staan mag die niet overrulen. De twee
takken in het `docToken`-effect staan in die volgorde, en dat ís de regel — er is geen andere
plek waar hij staat.

**Onthouden gebeurt bij het verlaten, niet bij elke toetsaanslag.** `rememberCaret` staat op de
twee punten waar een notitie ophoudt de notitie op het scherm te zijn: een andere openen, en een
bestand selecteren in plaats van een notitie. Bewust *niet* op de paden die de open notitie naar
de prullenbak doen of verwijderen — daar is niets om naar terug te keren.

**Een positie voorbij het einde is geen uitzondering.** De notitie kan tussen twee bezoeken
korter zijn geworden. De offsets worden afgekapt en aan `TextSelection.between` gegeven, dat
zelf terugvalt op `Selection.near` als de plek geen tekstpositie meer is — het herstel zit in
een effect, en een uitzondering daar neemt het hele leesvenster mee.

---

## B71 — Ctrl+Shift+T bleef zoals hij was, en de oorzaak lag buiten de app

**Genomen** op 19 augustus 2026. Dit is geen wijziging aan de sneltoetsen maar een afgesloten
onderzoek, en het staat hier om de methode en niet om de uitkomst: er is **niets** veranderd aan
`keys`, en dat is precies wat de meting voorschreef.

`Mod-Shift-T` is drie keer dood gemeld op Windows en twee keer gerepareerd — geclaimd in
`before-input-event` (`editor-keys.ts`), daarna een tweede toetscombinatie ernaast. Beide keren
kwam de melding ongewijzigd terug. Bij de derde melding is er bewust niets geraden maar
`--key-probe` gedraaid, en dat is precies waarvoor hij gebouwd is.

**Wat het logboek zei.** Op de meldende Windows-machine, in het opnamevenster:

- `Shift+T` levert een regel op — `key="T" code=KeyT shift=true`.
- `Ctrl+T` levert een regel op — `key="t" code=KeyT ctrl=true`.
- `Ctrl+Shift+T` levert **geen enkele `KeyT`-regel** op. Er verschijnt in plaats daarvan een
  `key="c" code=KeyC ctrl=true shift=false`.
- `Ctrl+Shift+D` komt vijf van de vijf keer aan, met `claim=task:editor`.

**Dat er iets vóór in de plaats kwam was de aanwijzing.** Een gewone `RegisterHotKey` die een
toetscombinatie opeist levert stilte op; hier kwam er een *andere* toetsaanslag terug, met de
Shift eraf en een kleine letter. Dat is het handschrift van iets dat toetsen injecteert, en dat
is een veel kleinere verzameling programma's dan "iets neemt hem weg".

**De oorzaak, bevestigd door de melder zelf: een eigen AutoHotkey-script**, dat `Ctrl+Shift+T`
onderschepte en er een `Ctrl+C` voor in de plaats stuurde om aan een ander commando te
ontsnappen. Geen eigenschap van Windows, geen eigenschap van Chromium, en niets in deze
broncode — één script op één machine, geschreven door degene die de melding deed.

**Dus verandert er niets aan de registratie.** `Mod-Shift-T` staat waar hij altijd stond: hij is
de raadbare van de twee naast de andere twee lijsttoetsen, en er is geen enkele eigenschap van
het platform of van deze app die hem een tweede plaats geeft. `Mod-Shift-D` blijft ernaast staan
in plaats van weggehaald te worden — hij kost niets, is in elke scope vrij, 'D' van *done*, en hij
is degene die bleef werken zolang de oorzaak onbekend was. Beide worden vanuit één plek geclaimd,
omdat `editorKeyIntent` `matches` over de hele registratie stelt en niet over één binding.

**Wat er wel verandert is wat we hierover mogen zeggen.** Twee reparaties zijn uitgeleverd tegen
een oorzaak die niemand gemeten had, en achteraf blijkt dat ze een been repareerden dat niet
gebroken was — hetzelfde logboek laat zien dat de hele keten van toetsaanslag tot `toggleTask` op
die machine gewoon werkt. Beide claims blijven staan: ze zijn op zichzelf correct, ze kosten
niets, en `before-input-event` is nog steeds de juiste plek voor een toets die geclaimd moet
worden. Maar de les is die welke dit project blijft betalen, nu voor de derde keer (B57 → B59,
B62's serie, en deze): **een diagnose die zijn eigen melding overleeft is onvolledig geweest, en
de uitweg is meten in plaats van nog eens repareren.** Drie meldingen, twee reparaties, één
logbestand. De probes bestaan hiervoor; ze horen eerder gedraaid te worden, niet later.

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
| ~~En waarom deed Ctrl+Shift+T niets op Windows?~~ | **Beantwoord op 19 augustus 2026, door te meten in plaats van te raden.** `--key-probe` op de meldende machine: `Shift+T` komt aan, `Ctrl+T` komt aan, `Ctrl+Shift+T` levert geen enkele `KeyT`-regel op — er komt een `Ctrl+C` voor in de plaats. Dát er iets vóór in de plaats kwam wees de weg: een eigen AutoHotkey-script van de melder onderschepte de combinatie en stuurde `Ctrl+C`. Geen eigenschap van Windows en niets in deze broncode; er is dan ook niets aan de sneltoetsen veranderd. B71 |
| **Wát houdt die map op Windows vast?** | Onbekend, en dat hoort hier te staan. B57 haalde de eigen handle van de app weg en de melding kwam ongewijzigd terug, dus de watcher was het niet (alleen). Sinds B59 noemt de weigering de code en het bestand, en `--trash-probe` loopt de map na — de eerstvolgende melding hoort de vraag te beantwoorden in plaats van te verplaatsen. `TEST-PROTOCOL.md` §24 |
| **Is de mappenklem op Windows weg, en wat kost het pollen daar?** | Nu — B57 is op Linux gemeten (de prullenbak neemt en verwijdert een map, een geklemde map antwoordt in plaats van te weigeren), maar de klem zelf is een Windows-kernelding dat hier niet na te maken is. Ook de prijs van een stat-ronde per twee seconden op een echte, grote OneDrive-vault is alleen daar te voelen. `TEST-PROTOCOL.md` §23 |
| Opent de vaultkiezer bij een verse installatie op een machine met precies één zakelijke OneDrive? | Nu — het pad is met een nagebootste OneDrive gemeten (zonder de reparatie geen dialoog en een aangemaakte map, met de reparatie een echt venster), maar niet op een echte werkmachine, `TEST-PROTOCOL.md` §22 |

---

## B72 — Een bullet kan met een ster gemarkeerd worden, en die ster staat in het bestand

**Genomen** op 19 augustus 2026, uit dagelijks gebruik: er was geen manier om één regel in een
lijst aan te merken als "hier moet nog naar gekeken worden". Een vinkvakje betekent iets anders
— een taak is af of niet — en een tag is iets over de hele notitie.

**Het besluit.** Een bullet kan een gele ster dragen in plaats van zijn aanduiding. In het
bestand staat dat als `- ⭐ Bel Jan`; in de editor is de ster een *eigenschap* van het lijstitem
(`starred`, naast `checked`) en geen tekst. `Mod+Shift+S`, plus een regel in het
rechtermuisknopmenu.

**Waarom hij in het bestand moet staan.** `list-marker-style.ts` — dat een bullet mee laat
vetten met zijn eigen regel — schrijft de regel op waar dit tegen gehouden wordt: dat is een
decoratie *omdat* een vette bullet niets betekent wat niet al elders in het bestand staat. Een
ster betekent iets wat nergens anders staat. Dus geen `DecorationSet`, en geen B10- of
B6-discussie: het is inhoud.

**Waarom een eigenschap en geen tekst.** De goedkope versie was de ster gewoon als twee tekens
in het item te zetten en de bullet weg te stylen. Dan is de ster echter tekst: Backspace eet hem
per teken op, `plainText()` en dus de zoekindex zien hem, hij staat in het uittreksel, hij staat
in de regel die de takenlijst toont, en hij komt mee als je de zin selecteert. Dat is precies
wat "verder in alles als een gewone bullet" uitsluit. Als eigenschap kost hij één CSS-regel op
`::marker` en verder niets.

**Waarom die spelling en geen andere.** Vier alternatieven, alle vier slechter:

- *Een ander aanduidingsteken* (`*` in plaats van `-`): §3.4 legt `-` vast, en
  `mdast-util-to-markdown` gebruikt het andere teken al zelf om twee lijsten naast elkaar uit
  elkaar te houden. Er is geen kanaal per item.
- *Een eigen syntax* (`- (*) tekst`, een sigil, een HTML-commentaar): Obsidian toont dat als
  ruis, het vraagt om ontsnappingsregels, en het botst met het uitgangspunt van
  `03-markdown-dialect.md` dat alles daar correct moet tonen (B7).
- *Obsidian's eigen `- [*]`*: geen GFM. `micromark-extension-gfm-task-list-item` kent alleen
  `[ ]` en `[x]`, dus dit leest hier als een bullet met de letterlijke tekst `[*]` — en het zou
  "gemarkeerd" en "is een taak" op één hoop gooien, wat juist het tegenovergestelde is van wat
  gevraagd werd.
- *Een veld in de frontmatter*: een ster gaat over één regel, niet over de notitie.

De gekozen vorm is gemeten voordat er iets op gebouwd is: `- ⭐ Aandacht voor dit punt` gaat
byte-identiek door de stringify-opties van dit project heen. `⭐` (U+2B50) staat niet in de
*unsafe*-verzameling van `mdast-util-to-markdown` — die bevat alleen ASCII-leestekens — dus hij
wordt in geen enkele positie ontsnapt en heeft geen uitzondering nodig zoals B19's `#`.

**Ster en vinkvakje sluiten elkaar uit.** Een taakitem heeft helemaal geen `::marker`: het
vakje staat absoluut gepositioneerd in de aanduidingssleuf. Er is dus geen plek waar allebei
kunnen staan. Dat is een besluit en geen opmaakprobleem, en het wordt aan drie kanten
afgedwongen — `toggleStar` haalt het vakje weg, `toggleTask` haalt de ster weg, en
`liftStarMarkers` weigert een ster te lezen uit een item dat al een vakje heeft. Dat laatste is
wat een elders geschreven `- [ ] ⭐ Iets` byte-identiek laat terugkomen: de ster blijft daar
gewone tekst. Hetzelfde geldt in een genummerde lijst, waar het nummer de aanduiding is.

**De prijs, uitgesproken en niet ontdekt.** Een bullet die écht met een ster en een spatie wil
beginnen, kan niet: die spelling *is* de aanduiding. Er is geen ontsnapte vorm om het aan te
meten zoals `restoreEmptyTasks` `\[ ]` van `[ ]` onderscheidt — `⭐` is geen leesteken. De bytes
blijven in beide lezingen gelijk, dus er gaat niets verloren; alleen de betekenis kantelt.
`test/limitations.test.ts` legt het vast, en `test/corpus/29-sterretjes.md` legt de bytes vast.

---

## B73 — Het Waar-veld vult aan uit de locaties die de vault al kent

**Genomen** op 19 augustus 2026, uit dagelijks gebruik. B66 gaf het Tags-veld aanvulling en
schreef er in één adem bij dat Wie die *niet* krijgt: "een naam komt niet uit een gesloten
verzameling zoals een tag dat doet". Waar wel. Er zijn een handvol plekken waar gewerkt wordt —
Teams, kantoor, bij de klant — en die worden eindeloos herhaald, met steeds net een andere
spelling als je ze intypt.

**Het besluit.** Bij de eerste focus op het Waar-veld wordt de lijst opgehaald, dezelfde lijst
die de vault zelf al bijhoudt, meest gebruikte eerst. Dezelfde besturing als bij Tags: pijltjes,
Enter of Tab om te kiezen, Escape om te sluiten met `stopPropagation()` (de regel van 18 augustus
2026), muisrij met `mousedown` voorkomen zodat blur de klik niet aftroeft.

**Wie deze keer géén aanvulling krijgt, is nog steeds Wie.** Dat argument is onveranderd.

**Er hoefde niets aan de index te gebeuren.** `location` is een kolom op `notes` sinds de tabel
bestaat, en `buildRecord` vult hem al bij elke scan en elke herindexering. Geen migratie, geen
`SCHEMA_VERSION`-ophoging, geen herbouw: er is geen nieuwe gegevensbron, alleen een vraag die
niemand stelde. Wat ontbrak was de optelling, en die is `facets()`' eigen twee regels met een
derde veld — al staat hij er nadrukkelijk *niet* bij in. `facets()` voedt het filterpaneel van de
bibliotheek, en dat heeft geen Waar-filter; die uitkomst verbreden voor een aanroeper waar dat
paneel niets van weet is precies waar `IPC.tagSuggestions` destijds uit `facets().tags` voor
losgetrokken is. `locationFacets` staat ernaast en `IPC.locationSuggestions` ook.

**Het aanvullen gaat over het hele veld, niet over een token.** Dat is het enige echte verschil
met de tag-kant en de reden dat `location-typeahead.ts` een zustermodule is en geen extra export
daar. Een Tags-veld bevat een *lijst*, dus bestaan `tokenAt`/`applySuggestion` om bij het ene
woord te komen waar de cursor in staat; een locatie is één waarde die spaties mag bevatten —
"Kantoor Amsterdam", "Bij de klant op kantoor" — en die opknippen zou aanvullingen aanbieden voor
het woord onder de cursor en het veld aanvullen tot een fragment van zichzelf. Kiezen is daarom
een gewone vervanging, zonder scheidingsteken en zonder cursorrekenwerk.

**Twee lijsten kunnen tegelijk openstaan**, want Tab gaat van Tags naar Waar zonder dat er iets
tussenin de focus verliest. Daarom heeft het Waar-veld zijn eigen `suggesting`, `active` en
`hoverGuard` in plaats van die te delen: één gedeelde `active` zou de markering verplaatsen in
een paneel waar niemand naar kijkt.

## B74 — Een afbeelding kan versleept worden, en dat formaat staat in het bestand

**Genomen** op 20 augustus 2026, uit dagelijks gebruik. Een schermafbeelding die in een notitie
wordt geplakt komt binnen op de grootte die hij toevallig heeft; `styles.css` zette er een
plafond op (`max-width: 100%`, `max-height: 480px`) en verder was er niets. Een kleine
verduidelijking naast een alinea nam daarmee net zoveel ruimte als het onderwerp zelf.

**Het besluit.** Vier handvatten op de hoeken van een geselecteerde afbeelding. Slepen bepaalt
een *breedte*; de verhoudingen liggen vast. Het formaat gaat naar het bestand, in de vorm die
Obsidian zelf schrijft:

```markdown
![[2026-08-20-0915-schermafbeelding.png|400]]
![Het logo|320](https://voorbeeld.nl/logo.png)
```

**Waarom het in het bestand staat en niet ergens anders.** Een breedte die alleen op het scherm
bestaat is bij de volgende keer openen weer weg, en de vault is de enige plek waar deze app iets
bewaart dat over een notitie gaat (B9 zegt waar de *afgeleide* dingen staan, en dit is er geen).
Dus is het inhoud, en dan is het meteen ook een dialectbeslissing — §5.1.

**Waarom Obsidians spelling.** B7: de vault blijft leesbaar in Obsidian, en Obsidian kent deze
vorm al. Een eigen spelling verzinnen zou betekenen dat een notitie in de ene app op formaat
staat en in de andere niet, terwijl de vorm die het al doet gewoon voorhanden lag.

**Het is één gleufje met drie lezingen, en alle drie worden ze gevolgd.** Obsidian kijkt wát er
achter de streep staat: enkel cijfers is een breedte, `250x180` is een breedte én hoogte, en al
het overige is alt-tekst. Een eerste versie van dit besluit las alleen het eerste geval en gooide
de andere twee weg; dat is dezelfde dag nog rechtgezet, want het was de bug herhalen die dit
besluit hoorde op te lossen.

**Er gaat niets in dat gleufje verloren.** Dat is de kern. Vanaf de allereerste markdown-commit
(`18d1122`) gooide de parser *alles* achter de streep van een `![[…]]` weg — hij las het wel, er
was alleen geen plek om het te bewaren — dus een in Obsidian geschreven notitie verloor zijn
alt-tekst zodra er in deze app één teken in die notitie veranderde, zonder dat er iets over
gezegd werd. Iets niet begrijpen is nooit een reden om het niet te bewaren. Wat níét als formaat
leest blijft daarom letterlijk staan: een getal buiten de grenzen, een leeg gleufje dat er wél
is, en `250X180` met een hoofdletter.

**Dat laatste is in Obsidian nagekeken en niet beredeneerd**, en dat is een correctie waard: de
eerste versie van deze tekst bewéérde dat Obsidian hier ruimer is en dat dit dus een bewuste
afwijking was, zonder dat iemand had gekeken. Obsidian verandert de grootte bij een
hoofdletter-`X` óók niet. Het is dus overeenstemming, geen afwijking, en hem letterlijk bewaren
in plaats van hem naar `250x180` recht te trekken is daarmee gratis. Dezelfde les als B71: een
bewering over andermans software is een meting, geen gevolgtrekking.

**Alt-tekst wordt bewaard en voorlopig nergens getoond** — niet op de `<img>`, niet in het
uittreksel, niet in de index. Hij staat er om de rondgang te overleven, niet om iets te doen; wat
hij ooit wél moet doen is een aparte vraag die niemand nu stelt.

**Deze app schrijft zelf nooit een hoogte.** De handvatten houden de verhoudingen vast, dus wat
zij opleveren is `|400`: een hoogte die deze app zelf verzint zou een tweede bron van waarheid
zijn die niet meer klopt zodra het bestand erachter wordt vervangen. Een hoogte die iemand ánders
schreef is iets heel anders — die is een bewuste daad geweest — en wordt wél getekend en bewaard.
Een sleep op zo'n afbeelding schaalt daarom *beide* getallen met dezelfde factor en schrijft weer
`|WxH` terug: iemands afbeelding rechttrekken omdat hij toevallig een hoekje beetpakte is iets
besluiten wat deze app niet kan weten. Alleen een afbeelding zonder opgeslagen hoogte wordt naar
een kale breedte gesleept.

**Wat dit kost, en dat is opgeschreven in plaats van ontdekt.** Eén gleufje betekent één ding
tegelijk, dus een afbeelding kan geen formaat én alt-tekst dragen. Dat is de grens van het
formaat en geen keuze hier, maar het heeft een gevolg: een afbeelding met alt-tekst die je
versleept raakt die tekst kwijt. Dat gebeurt op één plek, met opzet (`image-resize.ts` wist `alt`
als hij een breedte schrijft) in plaats van het aan de serializer over te laten. En andersom
wordt `![Grafiek|2024](…)` als een breedte van 2024 gelezen, omdat er geen ontsnapte vorm bestaat
om de twee uit elkaar te houden; dezelfde afweging als bij B72's ster.
`test/limitations.test.ts` pint beide vast.

**Eén plek waar de syntax gespeld wordt.** `src/markdown/embed-field.ts`, in beide richtingen en
voor beide vormen. Twee spellingen van één syntax is hoe een plakactie en een heropening het over
dezelfde tekens oneens worden — de bug waar B58 voor bestaat.

**Een attribuut naast het doel, niet erin.** `target` is wat `resolveAttachment` oplost en wat
een mapnaamwijziging herschrijft (B45); een formaat dat erin verstopt zat zou door beide heen
reizen. Nu overleeft de breedte zo'n hernoeming gratis, omdat `rewriteTargetPrefix` de knoop
opbouwt uit `{ ...attrs, target }` — vastgelegd in `test/folder-rename-links.test.ts`, want een
hernoeming die stilletjes elke afbeelding in een map op ware grootte terugzet is precies het
soort verlies dat niemand opmerkt.

**Afbeeldingen wel, een PDF-pagina niet.** De ingesloten PDF heeft sinds B46 zijn eigen
Passend-keuze, en dat is een bewust genomen besluit *tegen* zoomen: de pagina is één al
gerenderde PNG, dus een zoom zou een vast aantal pixels vergroten. Handvatten daar zouden met dat
besluit vechten. Een chip heeft geen verhoudingen en dus niets om aan te trekken.

**De transactie landt één keer, bij loslaten.** Tijdens het slepen gaat de breedte alleen naar
`img.style`, zodat een sleep één stap in de geschiedenis is in plaats van één per pixel — en een
afbeelding waar iemand zich halverwege op bedenkt kost het bestand niets tot de knop omhoog komt.
Dubbelklikken op een handvat zet hem terug op ware grootte, wat de enige weg terug is voor een
breedte van een vorige sessie: Ctrl+Z reikt niet verder dan het venster open staat.

**Overwogen en niet gedaan.** Een percentage in plaats van pixels — leest prettiger, maar
waarvan een percentage? De kolombreedte verschilt per venster en per paneel, dus hetzelfde
bestand zou op twee machines twee formaten zijn. Obsidian schrijft pixels; die keuze is al
gemaakt.

## B75 — Een notitie kan bovenaan vastgeprikt worden, en dat staat in het bestand

**Genomen** op 20 augustus 2026, uit dagelijks gebruik. De notitielijst is gesorteerd op
gewijzigd, aangemaakt of titel, en dat is precies goed voor terugvinden en precies verkeerd voor
de twee of drie notities waar je deze week aan werkt: die zakken weg zodra je iets anders opent.

**Het besluit.** Een notitie kan bovenaan vastgeprikt worden, ongeacht de sorteervolgorde.
Maximaal drie tegelijk, met een nette weigering als er een vierde bijkomt. Het vlaggetje staat in
de frontmatter:

```yaml
pinned: true
```

**Waarom in het bestand en niet in de instellingen.** Er zijn twee machines en geen server. Een
lijst met paden in `settings.json` staat op één van de twee, en reist dus niet mee — je zou op de
Mac iets vastprikken en op de Windows-machine niets zien. Bovendien breekt zo'n lijst bij elke
verplaatsing of hernoeming, tenzij hij bij *beide* wordt bijgewerkt; dat is dezelfde boekhouding
die B35 en B45 voor links moesten bouwen, voor een vlaggetje dat die prijs niet waard is. In het
bestand reist het mee met OneDrive, overleeft het een herinstallatie, verhuist het gratis mee met
de notitie zelf, en is het in Obsidian gewoon te zien — dezelfde redenering waarom `tags:` daar
staat. B9 gaat over de *afgeleide* dingen (de index, de miniaturen); dit is er geen.

**Afwezig, niet `false`.** Een notitie die niet vastgeprikt is heeft het veld niet. Anders krijgt
elke notitie in de vault er bij de eerste de beste opslag een regel bij om iets te zeggen over een
functie die hij niet gebruikt. Losmaken haalt de sleutel weg, zodat een notitie die vastgeprikt is
geweest byte voor byte gelijk is aan een die dat nooit was.

**Een echte boolean.** Elk ander veld gaat door `emitScalar`, dat alles aanhaalt wat als iets
anders dan een string terug zou lezen — en een boolean langs die weg landt als `pinned: "true"`,
een string die toevallig een boolean spelt en de volgende keer als "niet vastgeprikt" terugleest.
Vandaar `BOOLEAN_FIELDS` in `frontmatter.ts`. Wat géén echte boolean is (`pinned: misschien`, of
`pinned: yes`, dat in YAML 1.2 een string is) wordt niet geraden maar onaangeroerd teruggegeven
via `extra` — schrijven aan een bestand dat je niet begrepen hebt is erger dan het niet snappen.

**`modified` blijft staan.** Dit is het deel dat het makkelijkst per ongeluk ongedaan wordt
gemaakt, en het staat daarom ook in `CONSTRAINTS.md`. Vastprikken is geen bewerking: `modified`
ophogen zou de notitie in de standaardsortering naar boven schuiven om een reden die niets met de
inhoud te maken heeft — precies de volgorde die het vastprikken juist moest repareren — en zou de
andere machine vertellen dat er iets in het bestand veranderd is. `setPinned` gaat daarom niet
door `saveNote`, dat de stempel altijd zet.

**De grens van drie wordt in het hoofdproces afgedwongen, tegen de index.** De renderer kent
alleen de lijst die op dat moment op het scherm staat; een notitie die vastgeprikt is in een map
waar niemand naar kijkt telt gewoon mee, en een grens die je omzeilt door eerst ergens anders te
gaan kijken is geen grens. Vandaar een `pinned`-kolom in SQLite en `SCHEMA_VERSION` van 3 naar 4:
`needsRefresh` leest een bestand alleen opnieuw als `mtime` of `size` verschoven is, en dat doet
het bestaan van een kolom niet — een oudere index zou elke notitie voor altijd als niet
vastgeprikt opgeven.

**Losmaken wordt nooit geweigerd**, alleen vastprikken. Als er ondanks alles vier staan — een
halve startscan, of een vierde die via OneDrive van de andere machine binnenkomt — tekent de lijst
er gewoon vier, en zijn ze alle vier los te maken. Het bestand zegt wat het zegt; er eentje van
verbergen zou de app zijn die het met de vault oneens is.

**Overwogen en niet gedaan.** Een eigen volgorde binnen de vastgeprikte notities. Drie rijen is
te weinig om een handmatige volgorde te verdienen, en met de gekozen sortering *binnen* de groep
beantwoordt de bovenkant van de lijst dezelfde vraag als de rest ervan.

---

## B76 — Vastgeprikte notities kunnen ook tegen de bovenrand blijven staan, en dat is een keuze

**Genomen** op 21 augustus 2026, uit dagelijks gebruik. B75 zet vastgeprikte notities bovenaan de
lijst, en dat is precies genoeg zolang de lijst op één scherm past. In een map met veertig
notities is het dat niet: zodra je scrolt schuiven ze mee omhoog en zijn ze weg, terwijl ze juist
vastgeprikt zijn omdat je er deze week telkens naartoe wilt.

**Het besluit.** Er komt een schakelaar in de instellingen, `keepPinnedInView`. Uit — de stand
waarmee B75 is geleverd — betekent: vastgeprikt *ten opzichte van de andere notities*, en verder
een rij als alle andere. Aan betekent: vastgeprikt ten opzichte van het venster, dus de rijen
blijven tegen de bovenrand staan terwijl de rest van de lijst eronder doorschuift.

**Een instelling en geen verandering.** Beide antwoorden zijn te verdedigen, en welk je wilt
hangt af van hoe lang de lijsten zijn waar je in scrolt. Aan kost de plank drie rijen van de
hoogte van het paneel, of je er nu naar kijkt of niet; uit kost je de notities waar je het vaakst
in bent. Dat is geen vraag die de app namens iemand hoort te beantwoorden, en het is er ook geen
waar één van de twee standen "verkeerd" in is.

**Per machine, in `settings.json`, en niet in de vault** — anders dan het vastprikken zelf. Het
onderscheid is dat van B75 omgedraaid: `pinned:` staat in het bestand omdat het iets over de
*notitie* zegt en dus meereist met OneDrive, en dit zegt iets over een *venster*. Het hoort thuis
naast `libraryPaneWidths` en `librarySort`, en de twee machines mogen het oneens zijn — een groot
scherm en een laptop hoeven hier niet hetzelfde te willen.

**Eén omhulsel, geen drie plakkende rijen.** De vastgeprikte rijen krijgen samen één `li` met
`position: sticky` eromheen, met de rijen zelf in een `ul` daarbinnen. Drie rijen die ieder apart
op `top: 0` plakken, tekenen over elkaar heen zodra de tweede de eerste inhaalt; ze ieder hun
eigen `top` geven betekent drie rijen van wisselende hoogte opmeten en dat na elke verandering van
paneelbreedte opnieuw doen. Eén omhulsel heeft geen van beide nodig.

De prijs ervan is dat er een element tussen de lijst en zijn rijen staat, en dat is precies wat
`role="presentation"` op de `li` en `role="group"` op de `ul` erbinnen opvangen: een listbox mag
zijn opties in een group hebben zitten, en in een lijstitem niet. Voor het toetsenbord verandert
er niets — `roveArrowKey` verzamelt de rijen met `querySelectorAll` vanaf `.notes-list`, dus ze
komen in documentvolgorde terug of ze nu een niveau dieper staan of niet. `test/note-list-pin.test.ts`
loopt met de pijltoets over de rand van de plank heen, want dat is het enige dat dit omhulsel
plausibel kon breken.

**De ondoorzichtige achtergrond is het mechanisme, geen opsmuk.** `.note-on` en de hover zijn
doorschijnend grijs, bedoeld om óp het paneel te liggen. Zonder een dekkende achtergrond onder de
plank lees je de rijen die eronder doorschuiven dwars door de vastgeprikte rijen heen — dat ziet
er niet uit als een vergeten kleur, dat ziet eruit alsof de notities dubbel staan.

**Staat de schakelaar uit, dan is er geen omhulsel.** `NoteList` tekent de `li` alleen als er iets
op de plank hoort; de lijst is dan tot op de byte de lijst van vóór dit besluit. Zo kan geen enkele
regel hierboven een venster bereiken dat er niet om gevraagd heeft.

---

## B77 — De grens van drie geldt per map, en een speld ordent alleen een map

**Genomen** op 21 augustus 2026, uit dagelijks gebruik, één dag na B75. Het besluit zelf staat
overeind — twee of drie notities bovenaan is precies wat er nodig was — maar de *eenheid* was
verkeerd gekozen. Drie voor de hele kluis leest bij het opschrijven als "drie dingen waar je deze
week aan werkt"; in gebruik is het "drie dingen per project". Zodra drie mappen hun deel op hadden,
kreeg de vierde een weigering te zien voor iets wat niets met die map te maken had.

**Het besluit, eerste helft.** Maximaal drie vastgeprikte notities **per map**. De directe map, niet
de boom eronder: `01 Projects` en `01 Projects/Klant X` zijn twee plekken met elk hun eigen ruimte.
Submappen optellen bij hun ouder zou betekenen dat dezelfde notitie tegen meerdere mappen tegelijk
meetelt, en dan hangt het antwoord af van wélke van die mappen je toevallig aan het bekijken was
toen je vastprikte.

**Waar het wordt afgedwongen verandert niet, en dat is het deel dat het makkelijkst verkeerd wordt
begrepen.** B75 zette de grens in het hoofdproces omdat de renderer alleen de lijst op het scherm
kent. Dat argument werd toen opgeschreven als "een notitie die vastgeprikt is in een map waar
niemand naar kijkt telt gewoon mee", en die zin verdwijnt hier. Het argument zelf wordt juist
sterker: de map die geteld moet worden is heel vaak *niet* de map waar de boom staat — je kunt
vastprikken vanuit de lijst van een tag of vanuit een zoekresultaat, waar de rijen overal vandaan
komen. De renderer kan die telling dus in beginsel niet doen. Vandaar `pinnedNotesIn` naast
`pinnedNotes` in `index-db.ts`, gefilterd op `folderOf`.

**Geen nieuwe kolom en geen `SCHEMA_VERSION`-sprong.** Er is geen `folder`-kolom en die komt er ook
niet: `notes_pinned` is een gedeeltelijke index over `pinned = 1`, dus de filtering leest hooguit een
handvol rijen. Een kolom toevoegen zou een herindexering van de hele kluis kosten voor een vraag die
in JavaScript één regel is.

**Het besluit, tweede helft, en het volgt uit de eerste.** Een speld ordent een map, dus in een lijst
die *geen* map is telt hij niet mee. Een tag, een persoon, een zoekresultaat: daar staan de rijen in
de gekozen sortering en verder niets. Dit is geen smaakkwestie maar rekenwerk: drie spelden in elk
van acht mappen is één tagklik verwijderd van een lijst waarvan de bovenste vierentwintig rijen
vastgeprikt staan — en met B76's schakelaar aan is dat een plank die het hele paneel opeet. Het
tegenovergestelde van waar de functie voor bestond.

**De markering blijft wél staan, overal.** De speld is een feit over de *notitie*; alleen de
volgorde is een feit over de map. Een rij in een tagoverzicht die vastgeprikt is, draagt dus gewoon
het speldje — anders zou die rij het oneens zijn met het vinkje naast "Bovenaan vastprikken" in zijn
eigen menu. Vastprikken en losmaken blijven ook overal aangeboden; alleen de prullenbak weigert het,
zoals altijd.

**Waarom een schakelaar hier niet past, anders dan bij B76.** Daar waren beide standen te
verdedigen. Hier is de ene stand een lijst die aantoonbaar onbruikbaar wordt naarmate je meer mappen
gebruikt, en dat is geen keuze maar een fout die je de gebruiker laat maken.

**`keepPinnedInView` blijft precies wat het was.** De plank wordt getekend als er iets op hoort, en
er hoort alleen iets op in een map. Buiten een map is de lijst tot op de byte de lijst van vóór B76,
wat dat besluit zelf al als eigenschap opschreef.

---

## B78 — De sorteerknoppen worden een keuzeveld

**Genomen** op 21 augustus 2026, uit dagelijks gebruik. Boven de notitielijst stonden drie woorden —
Gewijzigd, Gemaakt, Titel — waarvan er één een accentkleur had. Dat is een toestand die je al moet
kúnnen lezen: niets zei dat het een groep was, niets zei dat het gekleurde woord het antwoord was in
plaats van een link, en de twee die *niet* golden namen evenveel breedte in als de een die dat wel
deed.

**Het besluit.** Eén knop: een pictogram (pijl omhoog naast pijl omlaag) plus het veld waarop op dit
moment gesorteerd wordt. Klikken vouwt de drie mogelijkheden uit met een vinkje bij de huidige;
kiezen zet de sortering en vouwt hem meteen weer dicht.

**Het menu is `ContextMenu` en geen eigen lijstje.** Dat onderdeel draagt de pijltjes-, Home-, End-
en Enter-loop, Escape, de focus die teruggaat naar wat het menu opende, het klemmen tegen de
vensterrand, en het vinkje. Elk daarvan een tweede keer bouwen is elk daarvan een tweede keer fout
kunnen doen. Het maakt de kiezer bovendien bereikbaar voor `--click-button`, dat een geopend
`.context-menu` doorzoekt in plaats van de pagina — `--click-button="Gewijzigd>Titel"` loopt er
gewoon doorheen.

**Geen richting in het pictogram.** Er valt in deze app geen richting te kiezen: datums staan altijd
nieuwste eerst en titels altijd A–Z. Een pijl die een omschakeling suggereert die niet bestaat, is
een uitnodiging om erop te klikken.

**De twee knoppen ernaast staan in één omhulsel.** `.notes-header` verdeelt zijn ruimte met
`space-between` over drie kinderen; een vierde los kind zou telling, sortering, Taken en Nieuwe
notitie gelijkmatig over de balk uitsmeren en de sorteerkiezer ergens anders neerzetten dan waar hij
altijd stond. Vandaar `.notes-actions` om Taken en + Nieuwe notitie heen.

---

## B79 — Het notitievenster is een blocnote, geen systeemkaartje

**Genomen** op 21 augustus 2026, uit dagelijks gebruik. Het venster was 720×440: een systeemkaartje
op zijn kant. Dat is het verkeerde plaatje — wat vervangen wordt is een Outlook-bericht, en waar het
als gebruikt wordt is een blocnote. Liggend ging bovendien de hoogte op aan chroom en de breedte aan
regellengte, zodat het tekstvlak op zo'n 270 pixels uitkwam: vier of vijf zichtbare alinea's, in het
ene venster dat verder niets ís dan zijn tekstvlak.

**Het besluit.** 600×720, staand. `.editor` is `flex: 1` en de enige rekbare rij, dus elke pixel
vensterhoogte landt in het tekstvlak: dat wordt daarmee ongeveer twee keer zo hoog.

**Geklemd op het werkgebied van het scherm, niet vertrouwd.** 720 hoog past nét op een 1366×768
laptopscherm, en een venster dat hoger is dan de ruimte waarin het geopend wordt, is een venster
waarvan de statusbalk — Weggooien, Invoegen, Help — onbereikbaar onder de rand hangt.
`workAreaSize` is al schoon van menubalk, dock en taakbalk, dus de marge hier is alleen wat lucht.

**Minima, die er niet waren.** De statusbalk is een flexrij zonder `flex-wrap` en de kop is een
raster van vier kolommen; een venster dat smal genoeg getrokken wordt, perst beide onleesbaar in
plaats van ze te laten teruglopen.

**Nog steeds niets onthouden.** De maat is een startwaarde, geen instelling: het venster wordt één
keer gemaakt en daarna alleen verborgen, dus wie het versleept houdt dat de hele sessie. Geometrie
opslaan is een besluit voor als er ooit om gevraagd wordt, niet iets om er hier bij in te bouwen.

---

## B80 — Weggooien krijgt een toets, en die toets is niet Escape

**Genomen** op 21 augustus 2026, uit dagelijks gebruik. B68 gaf Weggooien een knop in de statusbalk
en verder niets, in een venster dat vanaf de sneltoets tot en met opslaan zonder muis te bedienen is.

**Het besluit.** `Mod-Shift-Backspace`, alleen in het notitievenster.

**Waarom niet Escape**, wat de eerste ingeving is en de reden dat dit besluit hier staat: Escape is
in dit venster met opzet nergens aan gekoppeld — B75's buurman in `shortcuts.ts` schrijft het al op
voor "bewaren en sluiten" — omdat het de toets is die je per reflex indrukt. Weggooien is de ene
opdracht in dat venster die werk weggooit. Twee toetsen die je per ongeluk raakt, en de duurste
ervan, is precies de verkeerde combinatie.

**Waarom Backspace en waarom geshift.** Backspace is de toets die al "wis wat ik net deed" betekent.
`Mod-Backspace` zonder shift is op beide platforms het systeemeigen "wis tot begin van de regel"
binnen een tekstveld, en dit venster is grotendeels tekstveld — vandaar de geshifte vorm, die in
elke scope vrij was.

**Dezelfde grendel als de knop.** De toets doet niets voor een notitie die vanuit de bibliotheek is
overhandigd (`existing`), net als de knop die er dan niet staat. `CaptureWriter.discard` antwoordt
voor zo'n sessie toch al `null`, dus dit is de buitenste van twee onafhankelijke grendels — maar een
toets die stilletjes niets doet is beter dan een die een handler haalt om daar geweigerd te worden.

**Op de Mac wordt hij getekend, niet gespeld.** De modifiers zijn daar al symbolen, dus "⇧⌘Backspace"
zou drie tekens en dan een woord zijn: een overzicht dat halverwege opgeeft. `MAC_KEYS` in
`shortcuts.ts` maakt er ⇧⌘⌫ van. Alleen toetsen waarvan het Mac-teken de gebruikelijke spelling ís
horen daarin; Enter en Tab blijven op beide platforms woorden.

## B81 — Ook het Wie-veld vult aan, uit de namen die de kluis al kent

**Genomen** op 21 augustus 2026, uit dagelijks gebruik. B66 gaf het Tags-veld aanvulling en schreef
er expliciet bij dat het personenveld die *niet* krijgt: "een naam komt niet uit een gesloten
verzameling zoals een tag dat doet." Dat is de zin die hier wordt herzien.

**Het besluit.** Het Wie-veld vult aan uit `facets().people` — dezelfde telling die het
Personen-filter in de bibliotheek al leest — via `IPC.peopleSuggestions`, naast
`tagSuggestions` en `locationSuggestions`. Eerste focus, nooit bij het opstarten, mislukking
wordt een lege lijst. Geen migratie en geen `SCHEMA_VERSION`-bump: `attendees` staat al als
kolom op `notes` en `buildRecord` vult hem al.

**Waarom de zin uit B66 niet meer klopt.** Hij was een uitspraak over namen in het algemeen,
en dit veld gaat niet over namen in het algemeen. Het gaat over dezelfde handvol collega's,
elke keer opnieuw getypt en elke keer nét anders gespeld — precies het argument dat B73 al
voor het Waar-veld heeft aanvaard. De verzameling is zo gesloten als de geschiedenis van de
kluis zelf, en dat is de enige verzameling waar deze drie velden ooit uit aanvullen. Wat er
niet in staat typ je gewoon; er wordt niets geweigerd.

**Een token, geen heel veld** — daarin lijkt dit op Tags en niet op Waar, want het veld houdt
een *lijst*. Het verschil met `tag-typeahead.ts` is één regel en die regel is het hele bestaan
van `people-typeahead.ts` als apart bestand: **witruimte scheidt hier niet**. "Jan de Vries" is
één naam, en een scheidingsteken-verzameling met spaties erin zou aanvulling aanbieden voor
"de". Alleen `,` en `;` — exact waar `parseAttendees` op splitst, want aanvullen mag niet iets
anders vinden dan vastleggen.

**De spatie na de komma wordt overgenomen, niet toegevoegd.** Een token begint hier direct
achter de komma en opent dus meestal met de spatie die de vorige aanvulling achterliet. Die
weggooien schrijft "Jan,Pieter Jansen" — dat parseert prima en leest als een typefout die
niemand gemaakt heeft. Aan het begin van het veld staat er niets, en dan komt er ook niets.

**Wat het veld al heeft wordt uit de live tekst gelezen, niet uit `values.attendees`.** Dat is
de vergissing van B66's Tags-veld, hier vanaf de eerste versie goed: de array wordt pas bij
blur of Enter bijgewerkt, dus een naam die je uit het veld haalt zou tot dat moment uit zijn
eigen lijst gefilterd blijven.

## B82 — De twee vensters delen één titelveld en één balk aan de onderkant

**Genomen** op 23 augustus 2026, uit dagelijks gebruik.

De achtergrond. Het opnamevenster en de notitiebewerker in de bibliotheek delen al
`HeaderBlock`, `Editor`, `ContextMenu`, `insertMenuItems` en het sneltoetsenblad — en waren het
over vrijwel alles wat je *ziet* oneens. Het opnamevenster noemde de titel "Onderwerp" en
tekende hem als 13px halfvet in een getint veldje; de bibliotheek noemde hem Titel en tekende
hem als 17px vet zonder rand. Het opnamevenster zette zijn menu's en zijn status onderaan, de
bibliotheek bovenaan naast de titel. De knop naar het sneltoetsenblad heette "?". En de twee
lichtten hetzelfde veld in twee verschillende kleuren op, omdat `.reader-title-input` helemaal
geen `:focus`-regel had en op Chromiums eigen ring terugviel.

**Het besluit.** Eén titelveld (`.title-field` in `styles.css`, dat beide vensters laden), één
statusbalk, en die balk staat **onderaan** in beide vensters. Het opnamevenster krijgt een
Acties-menu naast Invoegen, met Weggooien erin; "?" wordt "Help".

**Waarom de onderkant en niet de bovenkant.** Het opnamevenster heeft zijn chroom daar altijd
gehad, en het is het venster met de vaste maat: 600×720, waarvan `.editor` de enige rekbare rij
is (B79). De bovenkant van de bibliotheek was bovendien al te vol — `.reader-header` is één
`nowrap`-rij waarin de titel het opnam tegen twee menu's en de bewaarstatus, en de weg terug uit
een gevolgde `[[…]]`-link was er eerder al uit weggehaald omdat hij de strip liet groeien en
krimpen (die strook onderaan is nu deze balk). Eén venster verplaatsen kon, en het venster dat
niets te winnen had bij verhuizen is het venster dat bleef staan.

**Waarom "Titel" en niet "Onderwerp".** Het is hetzelfde veld als in de bewerker en daar heet het
de titel. "(optioneel)" is vervallen: dat zei iets over de frontmatter, niet over het veld, en in
het andere venster stond het er nooit bij.

**Eén regel in Acties, en de vier van de bibliotheek ontbreken met opzet.** Hernoemen ís het
titelveld erboven. Verplaatsen weigert een notitie die dit venster geclaimd heeft
(`IPC.libraryMoveNote`), en dat heeft het per definitie. Dupliceren maakt een kopie die hier
niemand opent. Onthullen wil een bestand, en dat is er het grootste deel van de tijd nog niet.
De knop verschijnt alleen voor een nieuwe notitie, net als de Weggooien-knop die hij vervangt:
een menu waarvan de enige regel ontbreekt is erger dan geen menu.

**Herzien op 23 augustus 2026, op twee punten, uit dagelijks gebruik.**

*"(optioneel)" staat weer achter Titel.* De redenering hierboven klopt nog steeds — het zei iets
over de frontmatter en het andere venster zei het nooit — maar het was niet waar de melding over
ging. Dit is de enige placeholder in beide vensters die in een veld van 17px vet staat, en op die
maat draagt `--muted` net zoveel inkt als gewone tekst op 13px: een leeg titelveld las als een
al ingevulde titel. Vandaar allebei de helften — de tekst zegt dat het veld gemist mag worden, en
`.header .title-field::placeholder` dimt hem verder dan elke andere placeholder in dat venster.
Dat het andere venster het niet zegt is geen scheefheid: daar is de titel een `<h1>` met tekst
erin en valt er geen placeholder te lezen.

*De drie knoppen onderaan zijn één regel geworden in plaats van twee kopieën.* B82 zette in beide
vensters dezelfde balk neer, maar elk venster tekende zijn eigen knoppen: 11px tegen 12px, een
radius van 4 tegen 5, `--muted` tekst tegen de bodykleur, en een Help-knop zonder rand in rust
naast twee knoppen mét. Drie knoppen op een rij in het ene venster, en in het andere twee knoppen
plus een stuk statustekst dat toevallig aanklikbaar was. `.reader-actions button` is daarom
verhuisd naar `styles.css` en noemt daar ook `.capture-actions` — om dezelfde reden als
`.title-field` hierboven: beide vensters laden dat bestand en maar één laadt `library.css`. Eén
regel, want een kopie is precies wat het verschil heeft gemaakt. De bibliotheek kreeg er de
Help-knop bij die ze niet had; die stond alleen in de zijbalk en achter F1, en dat is de verkeerde
plek om te zoeken terwijl je schrijft.

*En de bewerker in de bibliotheek is nu geschaduwd zoals het opnamevenster.* `.reader-header`,
`.reader-footer` en `.notes-header` staan op `--surface`, de kleur die `.header` en `.statusbar`
altijd al hadden. De notitielijst zelf blijft op `--background`: dat is een lijst met dingen, geen
oppervlak, en daar moet de gekozen regel uitspringen.

**Wat dit besluit bijna om zeep hielp, en waarom het in `CONSTRAINTS.md` staat.** De gedeelde
regel is eerst als kale `.title-field` geschreven. Het veld in het opnamevenster staat in
`.header`, waar `.header input` één klasse *en één element* is — dus won die, en het venster
waar dit vooral voor bedoeld was veranderde helemaal niet, met een volledig groene suite
eromheen. Correct ogende CSS, verslagen door de cascade: dezelfde fout als B48 en die van
`.overlay`, allebei ook geshipt. De selector noemt nu de container. Gemeten in de draaiende app,
niet beredeneerd.

## B83 — Zoeken kijkt in de map waar je staat; de hele kluis is een keuze

**Genomen** op 23 augustus 2026, uit dagelijks gebruik.

`searchNotes` draagt sinds het geschreven werd een `scope`-optie, met in zijn eigen commentaar
de zin dat niets hem ooit meegaf — dus was elke zoekopdracht een zoekopdracht over de hele
kluis, en "in dit project" bestond niet.

**Het besluit.** De standaard is de map die in de boom geselecteerd staat, **en alles eronder**;
een knop naast het zoekvak verbreedt hem naar de hele kluis.

**Waarom die standaard.** De map is de context waar je toch al in staat. Kluisbreed zoeken is
nooit gekozen — het was wat er het eerst gebouwd werd, en het is de reden dat een resultaat uit
een archief van drie jaar terug tussen de treffers van vanmiddag staat.

**Waarom een deelboom en niet één map.** `searchNotes` filtert op een padprefix, precies zoals
`tasksIn` dat voor de Takenweergave doet. Eén enkele map zou de standaard onbruikbaar maken —
notities in een project staan in submappen — en twee opties die "deze map" verschillend
uitleggen zijn erger dan één.

**Waarom de verbreding niet blijft staan.** Hij wordt teruggezet bij het verlaten van een
zoekopdracht *en* bij elke verplaatsing in de boom. Verbreden vraag je per zoekopdracht; mee
verhuisd naar de volgende map is het een stand die niemand voor die map heeft gezet en die
nergens op het scherm wordt uitgelegd.

**Geen knop waar hij zou liegen.** Een tag, een persoon en het paneel met losse bijlagen komen
per definitie uit de hele kluis; die hebben geen map om "deze map" te betekenen, dus zoeken ze
kluisbreed en krijgen de knop niet te zien.

## B84 — De zoektaal verlaat de placeholder voor een paneel dat je kunt lezen terwijl je typt

**Genomen** op 23 augustus 2026, uit dagelijks gebruik.

De hele zoektaal — `type:meeting tag:klantx attendee:"Jan de Vries" after:2026-01-01` — stond in
de placeholder van het zoekvak: onleesbaar op die breedte, en weg zodra je één teken typte. Een
hint die verdwijnt op het moment dat je hem nodig hebt is geen hint.

**Het besluit.** Een paneel onder het zoekvak, dat opent zodra het vak focus krijgt. De
placeholder wordt "Zoeken…".

**Waarom geen modal.** Dit is B51's argument voor het `/`-menu, één veld verderop: een kiezer met
eigen focus neemt precies weg wat je hem voor opendeed. De cursor blijft in het vak, dus je leest
de syntaxis terwijl je hem typt.

**Eén mechanisme voor beide gebaren.** Het paneel hangt aan de *focus* van het vak. Klikken geeft
focus, en `Mod-F` gaf al focus en selecteerde de tekst — aan de sneltoets hoefde niets te
veranderen, en er is geen tweede tak die met de eerste oneens kan raken.

**Escape gaat over het paneel vóór de zoekopdracht.** Escape betekende hier al "verlaat het
zoeken". Eén druk doet één ding, wat de regel is die het verlaten van een zoekopdracht vanaf een
treffer al volgt: eerst het paneel, dan het zoekvak.

**De regels zijn voorbeelden, geen knoppen.** Geen `tabIndex`, geen klik. Een regel die je kúnt
kiezen is een regel die de cursor een invoeging schuldig is op een plek die dit paneel niet
bijhoudt — en die keuze is er al, in de vorm van de tekst overtypen.

## B85 — Weggooien vraagt door, tenzij er niets in staat

**Genomen** op 23 augustus 2026, uit dagelijks gebruik.

Weggooien in het opnamevenster vroeg niets. Het argument daarvoor stond in de code en was niet
gek: het concept gaat naar `_trash` en komt er via Terugzetten weer uit — precies het argument
waarmee B54 een notitie op de prullenbak laat slepen zonder één vraag.

**Wat dat argument hier mist.** Weggooien zit hier aan een toets (B80), staat één regel diep in
een menu onderaan een venster waar iemand zit te typen, en **neemt het venster mee**. Daarna is
er niets meer op het scherm waaraan je merkt dat het gebeurd is: geen rij die verdwijnt, geen
map die één notitie minder telt. Een omkeerbare handeling die niemand doorheeft is niet
omkeerbaar in de zin die dat argument bedoelde.

**Het besluit.** Een bevestiging vóór Weggooien, en alleen als er iets in de notitie staat.

**Waarom niet altijd.** Een vraag boven een lege notitie is precies het soort vraag dat mensen
leert vragen weg te klikken. Het venster staat het grootste deel van de dag leeg te wachten, dus
dat zou ook nog eens de gewone toestand zijn.

**Hoe "leeg" gemeten wordt, en waarom niet met `dirtyRef`.** `dirtyRef` is de andere kandidaat en
de verkeerde: die overdrijft met opzet (zie zijn eigen commentaar) en blijft waar staan nadat je
één teken typt en weer wist. Het document wordt op zijn *structuur* beoordeeld en nooit op zijn
tekst — één lege tekstblok is wat een verse editor bevat, al het andere telt. Een notitie met
alleen een geplakte afbeelding erin heeft namelijk helemaal geen tekst, en dat is nu juist het
ene wat je niet kunt overtypen. De koptekstvelden worden veld voor veld tegen een verse
`HeaderValues` gelegd, zodat een veld dat er later bijkomt meetelt zonder dat iemand aan deze
functie hoeft te denken.

**De vraag zegt niet dat het onomkeerbaar is**, want dat is het niet. Ze zegt waar de notitie
heen gaat. Een waarschuwing die meer belooft dan ze waarmaakt is een waarschuwing die de volgende
keer niet meer gelezen wordt.

**Eén pad voor de toets en het menu-item.** Allebei door dezelfde functie, zodat de twee het niet
oneens kunnen worden over wanneer er gevraagd wordt — dezelfde regel waaronder de `existing`-
controle staat die ze ook al delen. En zolang de vraag openstaat bezit hij het toetsenbord, net
als de notitiekiezer en het tabelrooster: Escape moet de vraag intrekken en niet het venster
wegstoppen met de vraag er nog op.

**`Ask` is daarmee van beide vensters.** De regels ervan verhuisden naar `styles.css` om de reden
die `.palette` en `.title-field` er al hebben: beide vensters laden dat bestand, `library.css`
maar één. `.settings` blijft in de bibliotheek staan, want dat blad is alleen van dat venster.

## B86 — De prullenbakvraag zegt wat het kost, niet alleen wat erin zit

**Genomen** op 23 augustus 2026, uit dagelijks gebruik.

De vraag vóór het legen van de prullenbak telde eerst de notitierijen op het scherm, en telt sinds
`trashContents` recursief notities, mappen en bestanden. Dat is wat er *in* zit. Twee dingen die
je pas mist als ze weg zijn, stonden er niet bij.

**Het besluit.** De vraag noemt er twee getallen bij: de **openstaande taken** in de notities die
weggaan, en de **gekoppelde bestanden** die erdoor losraken. En de knop heet Prullenbak legen.

**Waarom openstaande taken.** Wat iemand wil weten vóór het legen is niet hoeveel notities het
zijn maar of er nog iets te *doen* mee weggaat. Alleen de openstaande: een afgevinkte taak is een
verslag, en een verslag dat met zijn notitie meegaat is wat het weggooien van die notitie
betekent. Het getal komt uit `taskItemsIn` en niet uit een reguliere expressie over de ruwe
tekst, want dat is de ene plek die bepaalt wat een taakregel is — de index en de vinkjes vragen
het daar ook. Hetzelfde getal staat per stuk in de vraag vóór "Definitief verwijderen"; een map
in de prullenbak wordt daarvoor doorlopen, om dezelfde reden dat de telling van het geheel
recursief is.

**Waarom gekoppelde bestanden, en waarom als tweede zin.** Die bestanden zitten niet in de
prullenbak en worden ook niet verwijderd. Een notitie in de prullenbak telt mee als verwijzing
zolang ze teruggezet kan worden — daar is `findUnlinkedAttachments` met opzet op gebouwd — dus
een foto waar alleen die notitie naar wijst is vandaag *niet* los, en wordt dat op het moment
dat de prullenbak geleegd wordt. Dan staat ze in het paneel met losse bijlagen (§6.5). Dat is
een ander soort mededeling dan een telling van wat er weggaat, en dus een aparte zin.

**Exact, niet bij benadering.** Er wordt afgetrokken: een bijlage waar ook een levende notitie
naar verwijst blijft gekoppeld en telt niet mee. De verwijzingen van de levende notities komen
uit de index (`note_links`), precies zoals het paneel met losse bijlagen ze eruit haalt — anders
zou de vraag de hele kluis moeten lezen op een Files On-Demand-kluis, wat daar al eens de
oorzaak was van een venster dat op "Zoeken…" bleef staan.

**Nullen blijven weg.** Een prullenbak met zes notities en verder niets zegt "6 notities". De
getallen verdienen hun plaats pas als ze iets toe te voegen hebben; dat was de regel al voor
mappen en bestanden en geldt nu voor beide nieuwe getallen.

**Waarom "legen" en niet "leegmaken van".** Wissen is wat een filter en een zoekvak doen, en die
staan allebei één klik verderop in ditzelfde venster. Dit is de ene knop die iets vernietigt.

**Uitgebreid op 23 augustus 2026, naar de gewone verwijdervragen.** Dit besluit gaf de telling
aan de twee definitieve verwijderingen; de twee gewone — Verwijderen op een notitie, Map
verwijderen in de boom — kregen hem niet, op de onuitgesproken redenering dat een gang naar de
prullenbak omkeerbaar is en de vraag er dus minder toe doet. Dat is hetzelfde feit, hoe je het
ook wendt: op het moment dat een notitie in de prullenbak ligt is ze weg uit het Taken-scherm en
uit elke maptelling, en wat er nog te *doen* in stond is precies wat een titel er het minst over
zegt. Terugzetten is het verschil, en dat verschil zit in de knoppen, niet in het getal. Dezelfde
woorden, dezelfde stilte bij nul: bij een map staan de taken als derde getal tussen dezelfde
haakjes als de notities en de submappen, want het is nog iets dat *in* die map zit — geen tweede
zin, die is voorbehouden aan de bestanden die juist **niet** meegaan.

Eén ding daaraan is een naam. De telling zelf was `trashItemTasks`, en die functie heeft nooit
iets met de prullenbak te maken gehad: ze loopt een pad af dat overal in de kluis mag liggen. Zo
heet ze nu ook (`openTasksAt`). Een naam die het bereik van een functie kleiner voorstelt dan het
is, is precies de naam die de tweede aanroeper een tweede kopie laat schrijven.

## B87 — Eén oppervlakkenstelsel: zes rollen, en het lichte thema stond op zijn kop

**Genomen** op 26 augustus 2026, na `DESIGN-CRITIQUE.md`.

Het lichte thema had `--surface: #ffffff` en `--background: #fbfbfc`: de lijst *waar de notitie
in staat* was grijzig, en alles wat eromheen zit — titelbalk, kopstrook, statusbalk, boom, elk
zwevend paneel — was wit. De omlijsting was dus lichter dan wat ze omlijst, en dat is precies
omgekeerd. Bevinding 2 van de kritiek heeft gemeten wat dat kost: notitielijst en lezer krijgen
dezelfde kleur, gescheiden door één pixel op **1,28 : 1**, met de boom nog eens 1,6 % ernaast.
Een venster met drie panelen rustte op een haarlijn die niemand ziet.

Het donkere thema had het probleem niet, met dezelfde twee variabelen. Dat is de aanwijzing: het
paar is gekozen waar het werkte en niet gecontroleerd waar het niet werkte.

**Het besluit.** Zes rollen, één keer per thema vastgelegd:

| Rol | Variabele | Licht | Donker |
|---|---|---|---|
| venster en inhoud | `--background` | `#ffffff` | `#1e1f22` |
| balken, koppen, panelen | `--surface` | `#f4f5f7` | `#26282c` |
| invoer- en waardevelden | `--field` | `#ebedf1` | `#1e1f22` |
| aanwijzen | `--hover` | `rgba(127, 127, 127, 0.1)` | idem |
| gekozen | `--selected` | `rgba(127, 127, 127, 0.22)` | idem |
| scheidslijn | `--border` | `#d7dbe1` | `#33363b` |

**Waarom het donkere thema onaangeroerd blijft.** De kritiek zegt het zelf: het donkere thema is
degene om na te doen, niet degene om mee te middelen. Zijn vijf oppervlakken houden hun waarde
tot op de pixel; het krijgt alleen de drie namen erbij. `--field` is er `#1e1f22` — de oude
`--background` — want elk veld in deze app staat in een `--surface`-container, dus die ene keuze
laat elk donker veld staan waar het stond.

**Waarom de notitielijst wit blijft en dus dezelfde kleur houdt als de lezer.** "Een lijst is
geen oppervlak" stond al in `CONSTRAINTS.md` en blijft staan: de lijst is inhoud, en wat er in
een lijst moet opvallen is de gekozen regel, niet de lijst zelf. Een derde grijstint ertussen —
overwogen, verworpen — zou een vierde oppervlak zijn om te onderhouden voor een scheiding die de
kopstrook van de lezer er nu al bovenop legt. De scheiding tussen die twee panelen is dus de
lijn, en die is van 1,28 : 1 naar **1,39 : 1** gegaan; de boom staat nu op een echt verschil met
de lijst ernaast (1,11 tegen 1,016), en dat is waar Bevinding 2 werkelijk over ging.

**Waarom zwevende panelen grijs meegaan.** Het palet, de rechtermuisknopmenu's, Help,
Instellingen, de conflictvraag: alles wat niet de notitie is, is omlijsting. Ze stonden al op
`--surface` en hoefden dus geen regel te veranderen — ze scheiden zich van de bladzijde met hun
rand en hun schaduw, zoals ze dat altijd deden.

**Aanwijzen en gekozen zijn twee variabelen, geen zeven getallen.** Het waren
`rgba(127, 127, 127, α)` met α ∈ {0,08 0,09 0,10 0,12 0,14 0,18 0,20} over vijftien regels. Een
aangewezen tak stond vier honderdsten van een gekozen notitie af, en een gekozen tak was niet te
onderscheiden van een aangewezen titelbalkknop — twee dingen die niets met elkaar te maken
hebben, in dezelfde kleur, om geen reden. Ze blijven **doorschijnend** grijs en krijgen met opzet
geen kleur per thema: zo'n tint landt op twee ondergronden — een witte lijstregel en een grijze
knop in de omlijsting — en een doorschijnende laag stapt mee met wat eronder ligt, waar een
vaste grijstint maar op één van de twee goed kan zijn. Twee tinten blijven literal: de kopregel
van een tabel *in de notitie* (dat is inhoud, geen toestand) en de vulling van de scanbalk (een
voortgangsbalk is geen selectie). Beide zeggen dat nu ook boven zichzelf.

**Wat er nog aan vast zat.** `.header input` vulde zich in rust met een eigen tint en bij focus
met `--background`; nu is rust `--field` — dezelfde kleur als elk ander veld in beide vensters —
en blijft focus `--background`, zodat een veld waar je in typt de kleur van de bladzijde krijgt.
In het donkere thema zijn die twee dezelfde waarde en draagt de accentrand de focus alleen, wat
ze bij `.ask input` en `.settings select` altijd al deed. `color-scheme` wordt eindelijk
opgegeven, zodat schuifbalken en de lijst die een `<select>` opent hetzelfde thema volgen als de
rest. En `var(--bg)` en `var(--fg)` stonden in `styles.css` zonder ooit ergens verklaard te zijn:
twee regels die niets deden, en waar nu een test op staat die elke `var()` tegen de verklaarde
namen houdt.

**Het venster kleurt niet meer donker vóór zijn eerste frame.** `backgroundColor` stond in beide
vensters hardgecodeerd op `#1e1f22` en vroeg `nativeTheme` niets. Dat was hinderlijk toen de
lichte bladzijde `#fbfbfc` was en is onhoudbaar nu ze wit is: de flits is dan het hele verschil
tussen de twee thema's. `windowBackground()` is die ene plek, één keer gelezen bij het bouwen van
het venster — geen luisteraar op `nativeTheme`, want deze kleur is alleen te zien in het moment
vóór de eerste verf, en het opnamevenster staat verborgen te wachten op een sneltoets met een
budget van 80 ms.

**Wat niet meegaat.** `pdfview.css` heeft een eigen, losse verzameling variabelen, met opzet:
dat venster laadt `styles.css` niet en zou met de variabelen de hele cascade meekrijgen. Zijn
`--pdf-chrome` is `#f4f4f5` — hetzelfde stelsel, apart bedacht — dus er is niets te herstellen.
De twee amberkleurige balken (`.disk-change-bar`, `.conflict-banner`) staan nog hardgecodeerd in
één kleur voor beide thema's; dat is een waarschuwingskleur en geen oppervlak, en het staat in
`TODO.md` als zodanig.

**Aangevuld** op 26 augustus 2026, uit een dag gebruiken van het bovenstaande: **de zesde rol
was nooit een kleur, en het accent deed in het ene paneel het werk van "gekozen" en in het
andere dat van "waar de toetsen zijn".**

Twee meldingen, één oorzaak. De gekozen map stond in `--accent` én vet én op een `--selected`
vulling; de geopende notitie stond op diezelfde vulling en verder niets. Bevinding 3 van de
kritiek had dat al gemeten en er de goede zin bij geschreven — "de map schreeuwt en de notitie
fluistert" — zodat het oog de boom voor het levende paneel aanziet, ongeacht waar de toetsen
werkelijk staan. `color: var(--accent)` is uit `.branch-on .branch-name` weg; het vet blijft,
want een mapnaam is één woord in een kolom van woorden en heeft geen tweede regel om aan
herkend te worden. Sindsdien betekent "gekozen" in beide panelen hetzelfde: de vulling.

De tweede melding kwam van Windows en gaat over de andere kant van dezelfde variabele.
`.branch:focus-visible, .note:focus-visible, .task-row:focus-visible` tekende een kader van
2px `--accent` met `outline-offset: -2px`, en bij 125 % schaling zet Windows daar drie pixels
neer — een verzadigd `#1a63d8` om een regel die de hele breedte van het paneel beslaat. De
notitielijst verliest die ring; de boom en de takenlijst houden hem. Dat is met opzet géén
symmetrisch besluit: de ring overal weghalen zou `roveArrowKey` door drie panelen laten lopen
zonder dat er ook maar iets meebeweegt, en de notitielijst is nu juist het paneel waar de
ring het minst deed — de regel waar de pijltjes staan is er bijna altijd ook de geopende.

**Wat dat kost, opgeschreven in plaats van later ontdekt.** `roveArrowKey` verplaatst focus
zonder te selecteren, dus wie met de pijltjes door de lijst loopt ziet de aangewezen regel
niet tot Enter hem opent. Bevinding 3 blijft daarmee open, en het antwoord daarop is een
paneelbrede behandeling — een accentrand op de actieve regel van het paneel dát de toetsen
heeft — en niet deze ring terug.

---

## B88 — De tekstgrootte in de notitie is een instelling van dit scherm, niet van de notitie

**Genomen** op 26 augustus 2026.

Gevraagd: de tekst in het bewerkvenster groter en kleiner kunnen maken — niet het vensterwerk
eromheen — en alles evenredig, zodat een kleinere broodtekst even kleinere koppen geeft.

**Eén hendel, en die was er al.** Alles binnen `.editor-content` was al relatief uitgedrukt:
de koppen in `1.5em` / `1.28em` / `1.12em`, `pre` in `0.86em`, `code` in `0.88em`, de
wiki-chips in `0.9em`, de opsommingsgoot in `1.5em`. Er stond precies één `px` in het midden
van dat stelsel — `font-size: 16px` op `.editor-content` zelf. Die is nu
`var(--editor-font-size)`, en daarmee schuift één getal alles evenredig mee. Gemeten onder
`Xvfb` met de pixels uit de PNG's: "Kwartaalplan" als H1 is 142 / 174 / 219 px breed bij
13 / 16 / 20, waar 13/16 en 20/16 141,4 en 217,5 voorspellen — binnen één pixel hinting.

Dat het al zo was, was smaak en geen regel, en precies zulke eigenschappen houden stilletjes
op te bestaan. `styles-editor-font-size.test.ts` houdt elke `font-size` onder
`.editor-content` tegen "relatief of `var(--editor-font-size)`", met één uitzondering die
bij naam genoemd wordt in plaats van weggepatroond: `.table-tool`, de knoppen van de
tabelbalk, die vensterwerk zijn dat toevallig ín het document getekend wordt.

**Per machine, niet per notitie.** Een grootte per notitie zou in de frontmatter moeten, en
daarmee: een weergave-instelling in het bestand, waar `03-markdown-dialect.md` er geen kent,
die naar de andere machine en naar Obsidian meereist als ruis, en die van "een notitie lezen
op een laptop" een wijziging van die notitie maakt. B10 zegt al dat openen het bestand niet
raakt. Dus staat hij bij `libraryPaneWidths`, `librarySort` en `keepPinnedInView` — per
machine, en de twee machines mogen van mening verschillen, wat het hele punt is als de ene
aan een 27-inch paneel hangt en de andere niet.

**Het vensterwerk gaat niet mee.** De boom, de notitielijst, de titelbalk, de kopstrook, de
statusbalk: alles blijft staan waar het stond. Het besturingssysteem heeft voor die andere
vraag al een instelling, en dit is de vraag naar de tekst waar je in typt.

**Een rij in Instellingen, geen sneltoets.** Vijf stappen — 13 / 14 / 16 / 18 / 20 — met
namen in plaats van getallen, want een maat die je intypt nodigt uit tot twijfelen over de
twee maten ernaast. Het is een vraag die je één keer per machine beantwoordt. De prijs is
gezien en aanvaard: het venster met het paneel is de bibliotheek, dus in het opnamevenster is
de grootte niet te veranderen terwijl je typt. De sneltoetsroute blijft beschikbaar als dat
alsnog blijkt te tellen; `Mod+0` is dan wél al bezet door "Gewone alinea", dus terugzetten
zou `Mod+Shift+0` worden.

**Main klemt de waarde.** `settings.json` is een bestand dat een mens kan openen, en
`--editor-font-size: 0px` is een venster zonder notitie erin en zonder weg terug naar het
paneel dat het zou repareren. Tussen 10 en 32, in main, niet in de renderer.

---

## B89 — Een kop is omkeerbaar, en een lijstopdracht tilt er een uit

**Genomen** op 26 augustus 2026.

Gemeld als één klacht — "een regel die eenmaal kop is, wordt niets anders meer" — en het
waren twee gaten met elk hun eigen oorzaak.

**Het eerste: `setHeading` was een `setBlockType` in één richting.** `Mod+1` op een regel die
al H1 was zette H1 opnieuw, en de enige weg terug was `Mod+0`. Die toets bestáát, staat op het
spiekbriefje en in het `/`-paneel, en is nog steeds niet wat iemand indrukt: elke editor met
een kopknop heeft "druk hem nog een keer in" aangeleerd. Alleen hetzelfde niveau schakelt uit;
`Mod+2` op een H1 zet gewoon H2, want anders zou langs de niveaus lopen elke keer door de
alinea heen zakken. Over een selectie wordt de vraag over álle tekstblokken gesteld en niet
alleen over het eerste — een halve selectie is niet "al H1", en uitschakelen op grond van de
eerste regel zou de opdracht één regel laten lezen en er vijf behandelen.

**Het tweede was geen fout en juist daarom erger.** `listItem` heeft als inhoud
`paragraph block*` (`schema.ts`), dus een `heading` kan nooit het eerste kind van een lijstitem
zijn; `wrapInList` vindt geen omhulsel en geeft **false** terug. Een `Command` die false
teruggeeft is een toetsaanslag die niets doet en niets zegt. Een kop weigerde dus bullet te
worden, met de vorm van het bestandsformaat als oorzaak en niets op het scherm dat daarop
wees. De kop wordt nu onderweg een alinea, wat toch al is wat de aanslag betekende: een
opgesomde kop is een vorm die dit dialect niet kan schrijven. `test/limitations.test.ts` pint
dat nog steeds — deze route *vermijdt* die vorm, ze versoepelt hem niet.

**Eén transactie, geen twee.** De opgetilde kop en de lijst eromheen worden samen
gedispatcht: het tweede commando draait tegen de tussenliggende toestand en zijn stappen
worden op dezelfde transactie teruggespeeld, wat mag omdat `state.apply(tr).doc` letterlijk
`tr.doc` is. Apart ongedaan gemaakt zou de eerste Ctrl+Z een alinea achterlaten waar een kop
stond — een toestand die niemand gevraagd heeft en niemand een naam kan geven. `withList`
hierboven dispatcht wél twee keer en komt daarmee weg, omdat beide helften lijstbewerkingen
zijn die hoe dan ook als één wijziging lezen.

Het geldt voor `toggleBulletList`, `toggleOrderedList` en `toggleTask`. `wrapInBlockquote`
niet: een `blockquote` neemt `block+` en kon een kop altijd al aan. `indent` ook niet: die
valt in een kop terug op `wrapIn(blockquote)`, en dat is bestaand gedrag met zijn eigen vraag.

---

## B90 — Het thema is een keuze van deze machine: systeem, licht of donker

**Genomen** op 27 augustus 2026.

Gevraagd naar aanleiding van het donkere thema dat in gesprekken steeds langskwam: een rij in
Instellingen om het thema te zetten op **systeem | licht | donker**.

**Er was al een thema, en er was geen keuze.** `styles.css` draagt sinds B87 zes rollen per
thema, en welk van de twee getekend werd hing volledig aan `prefers-color-scheme` — het
besturingssysteem was de enige stem. Dat is voor de meeste dagen het goede antwoord en het is
niet het enige: de twee machines waar dit op draait zijn een Mac en een Windows-doos, en die
twee mogen best verschillend staan zonder dat je er een systeeminstelling voor omzet.

**`nativeTheme.themeSource` in main, en geen klasse op het document.** Dat is het besluit dat
ertoe doet, want de voor de hand liggende route — `data-theme` op `<html>` en elke regel in de
drie stylesheets verdubbelen — kost drie bestanden en levert minder op. `themeSource` is
precies de knop waarop `prefers-color-scheme` in élke renderer antwoordt, dus:

- `styles.css`, `library.css` én `pdfview.css` blijven staan zoals ze staan; er is niets bij
  te houden en niets te verdubbelen.
- Het spul waar niemand CSS voor schrijft gaat mee: schuifbalken en het venstertje dat een
  `<select>` opentrekt worden door het OS getekend, en de regel `color-scheme: light dark`
  bovenaan `styles.css` is er al voor dat ze meelopen.
- Chromium herberekent de mediaquery in elk open venster op het moment dat de bron verandert.
  Er hoeft dus niets uitgezonden te worden en geen venster hoeft opnieuw te tekenen; het
  paneel ververst alleen zijn eigen bootstrap, zodat zijn eigen keuzelijst klopt.

**"Systeem" is een echt antwoord en niet de afwezigheid van een keuze.** Het is de vraag
doorgeven aan de machine, die hem blijft beantwoorden — een computer die bij zonsondergang
omslaat slaat de app mee om. Daarom staat het bovenaan en is het de standaard.

**De instelling wordt vóór het eerste venster toegepast.** `windowBackground()` (B87) leest
`nativeTheme.shouldUseDarkColors` bij de bouw van elk venster, om de kleur te kiezen die
Chromium zet vóór het eerste frame van de renderer. Zou het thema pas bij het registreren van
de IPC gezet worden, dan opent een machine die op licht staat en donker gekozen heeft ieder
venster met een flits van het verkeerde thema — precies het gebrek waarvoor
`window-background.ts` bestaat. Dus staat `applyTheme(settings.theme)` in `main()`, boven
`createCaptureWindow()`.

**Per machine, zoals `editorFontSize` en `keepPinnedInView`** (B88), en om de scherpere versie
van dezelfde reden: de systeeminstelling waar dit een overschrijving van is, is zelf al per
machine. En de waarde wordt in main gevalideerd en niet vertrouwd, net als de tekstgrootte:
`settings.json` is een bestand dat een mens kan openen, en Electron gooit op een waarde die
geen van de drie is.

---

## B91 — De notitielijst krijgt de focusrand terug, want weghalen haalde hem nooit weg

**Genomen** op 27 augustus 2026.

Gemeld als: "de rand om de geselecteerde notitie is oranje, en in de mappenboom is hij blauw."
Dat is één rij in de bibliotheek die zich anders gedraagt dan de rij ernaast — en het is de
directe rekening van de addendum bij B87 van gisteren.

**Wat daar weggehaald werd, was nooit de rand.** `.note:focus-visible` verdween uit
`library.css` op een Windows-melding: 2 px `--accent` rondom een rij over de volle breedte
tekent op 125 % schaling als drie, en dat is hard. Maar een `.note` draagt een rovende
`tabIndex` — package D's toetsenbordnavigatie — dus de rij is en blijft focusbaar, of dit
bestand er nu iets over zegt of niet. De regel weghalen gaf de rand daarmee niet weg, maar
wég: aan de UA, die hem tekent in de kleur van het platform. Op macOS is dat de systeemaccent
uit Systeeminstellingen, en die stond op oranje.

**Dus was de uitkomst het slechtste van de drie.** Niet "geen rand" (het argument van gisteren)
en niet "dezelfde rand als de boom" (de toestand daarvoor), maar *een tweede rand in een
kleur die een schuifje in het OS kiest*, in één van de drie panelen. Twee panelen, één
gebaar, twee kleuren.

**De drie panelen delen weer één regel.** `.branch:focus-visible`, `.note:focus-visible` en
`.task-row:focus-visible` staan in één blok, en dat ze in één blok staan ís het besluit: een
rand die in het ene paneel 2 px `--accent` is en in het andere iets anders, is precies het
gebrek waar dit uit voortkomt. `styles-selection-accent.test.ts` telt daarom ook dat er geen
tweede `.note:focus-visible` bij komt.

**De Windows-melding blijft staan en wordt anders beantwoord.** Niet met "dan maar geen rand",
maar met "dan dezelfde rand als de boom, die daar al net zo hard is". Het alternatief dat
gisteren niet gezien werd, is `outline: none` op `.note` — dat had de UA-rand óók weggenomen
— en dat is niet gekozen: het zet de notitielijst terug op geen enkele zichtbare
toetsenbordpositie, wat `DESIGN-CRITIQUE.md`'s bevinding 3 is en open blijft. Wat B87's
addendum als kosten opschreef ("terwijl je met de pijltjes door de lijst loopt is de rij
onzichtbaar tot Enter hem opent") is daarmee van de baan; wat overblijft is bevinding 3 zelf,
en het antwoord daarop is een behandeling op paneelniveau, niet deze rand nog eens.

**Wat dit leert, los van de kleur:** een regel die een UA-standaard onderdrukt, kun je niet
"weghalen". Je kunt hem vervangen door de standaard. Dat is een andere handeling met een
ander resultaat, en het verschil is onzichtbaar op de machine waar de standaard toevallig
onopvallend is.

---

## B92 — Drie panelen, één koplijn: 40 px boven, 28 px onder, in beide vensters

**Genomen** op 30 augustus 2026.

Dit is het antwoord op bevinding 7 van `DESIGN-CRITIQUE.md`, de laatste van de drie die de
foto's van 26 augustus opleverden en de enige die over de vorm van het venster zelf ging.
Gemeten vanaf de bovenrand: de mappenboom droeg drie knoppen op de paneelkleur en had
helemaal geen balk (~40 px), de notitielijst stapelde een zoekregel op een tel-/sorteerregel
(78 px), en de notitie zelf liep tot 127 px voordat het eerste woord ervan begon. Er liep
nergens een horizontale lijn over de bovenkant van het venster, en dus had het inhoudsvlak
geen bovenrand: drie losse stapels die toevallig naast elkaar stonden.

Aanleiding was een uitgewerkt ontwerpvoorstel (`design/design-handoff-pane-consistency/`,
variant 1a). Wat hieronder staat is niet dat voorstel, maar wat ervan overeind blijft nadat
het door de regels van dit project is gehaald — dat verschil is het besluit.

**Eén koplijn en één voetlijn, en ze zijn regels en geen getallen.** `PaneHeader` (40 px) en
`PaneFooter` (28 px) tekenen alle vier de balken in beide vensters. Dat het regels zijn en
geen maat die per paneel is overgeschreven, ís het punt: een vierde paneel, of een kop die
er een knop bij krijgt, mag de lijn niet kunnen breken. `styles-pane-bands.test.ts` telt
daarom niet alleen de twee hoogtes maar ook dat er verder *nergens* een tweede staat.

**De notitielijst gaf twee chromeregels op en kreeg er één balk en één voet voor terug.**
Niets is geschrapt: de telling, de sorteerkiezer en Taken staan in de voet, en het zoekveld
is in de kop gaan zitten, waar het de plaats van de mapnaam inneemt zolang het openstaat.
Dat laatste heeft een gevolg dat het ontwerp niet had voorzien — de kop was juist wat zei in
welke map je stond — en daarom leest de scopeschakelaar (B83) nu de mapnaam zelf in plaats
van "Deze map". Hij staat binnen het veld, niet ernaast, en blijft een *woord*: `--click-button`
zoekt op tekst, en een schakelaar zonder label bestaat niet voor de zelftest.

**Pictogrammen wel, pictogrammen-alleen niet.** De drie knoppen van de mappenboom zijn 26 px
iconen geworden. Dat mag omdat `ChromeButton` `label` verplicht stelt en op `aria-label` zet
wanneer er geen tekst staat, en omdat `--click-button` sindsdien op die naam terugvalt als
een knop geen eigen tekst heeft. De regel uit CLAUDE.md is dus niet versoepeld maar op één
plek nagekomen in plaats van op vijf. De voetknoppen houden hun woorden: *Modified*, *Tasks*,
*Insert*, *Actions*, *Help* — daar is geen breedte te winnen die het lezen waard is.

**En ze worden getekend, niet getypt.** Het ontwerp leverde `＋ ✎ ✕` als tekst aan. In het
draaiende venster (`npm run ui:kit`) kwam U+270E uit een vervangingsfont als iets dat de
meeste mensen een paperclip zouden noemen — naast een échte paperclip, zes rijen lager, in
dezelfde kolom. Dat is `trashGlyph`'s les van B67, en hij geldt hier opnieuw. Dit is ook het
enige wat alleen door te kijken gevonden kon worden, wat het derde punt van CLAUDE.md nog
eens onderstreept.

**Het palet van het ontwerp is overgenomen, maar op de rollen gezet.** Elf kleuren zijn zes
geworden: de paneelgrond en de balk zijn samen `--surface`, de vier tinten tekst zijn `--text`
en `--muted`, en de twee hovertinten zijn er niet — dat is één *toestand* die op twee
ondergronden landt, wat `--hover` als doorschijnende laag al oplost en wat precies de
zeven-alfa's is die B87 heeft opgeruimd. De waarden zelf zijn die van het ontwerp; alleen het
lichte thema verschuift, het donkere stapte al dezelfde kant op.

**Randloos, met de knoppen van het besturingssysteem ín de balk.** Beide vensters staan nu op
`titleBarStyle: "hidden"` — met `titleBarOverlay` op Windows 11, waar de knoppen daarmee die
van het systeem blijven en de snap-layouts en het systeemmenu behouden. 40 px dekt beide
platforms (stoplichten ~28, Windows 11 32), dus het chroom kost geen eigen hoogte en de drie
koppen blijven op één lijn. Nadrukkelijk *geen* eigen sluitknoppen meer: `TitleBar.tsx` is
verdwenen, en de echte Close betekent wat die van ons betekende — opslaan en wegleggen, wat
de `close`-handler in `capture-window.ts` altijd al deed. Linux houdt zijn eigen lijst: daar
is `titleBarOverlay` een no-op en zou randloos alleen verlies zijn.

**Wat dit niet oplost.** Bevinding 6 — een werkwoord in de kop waarvan het lijdend voorwerp
elders staat — wordt hier verzácht en niet gesloten: `✎` en `✕` noemen de map in hun tooltip,
en Verwijderen vroeg al door met de naam erin (B54). De echte oplossingen die de kritiek
noemde (het voorwerp in de kop zetten, of de werkwoorden naar de rij verplaatsen) staan nog
open. Bevindingen 1, 4, 5 en 8 zijn niet aangeraakt.


## B93 — Een schrijffout is van één schrijfopdracht, en de tekst gaat nooit nergens heen

**Genomen** op 31 augustus 2026, na verlies van echte notities.

Op 31 augustus 2026 hield OneDrive een net aangemaakte notitie in `00 Inbox` open, gaf
`rename()` `EPERM` terug, en schreef de app daarna een dag lang niets meer. Twee notities
die met Ctrl+Enter werden afgesloten bestonden nooit; een derde bleef staan op het derde
deel dat al bewaard was. Er stond nergens iets op het scherm — de statusbalk zei de hele
dag "Bewaard als …", omdat dat alleen de naam was van het bestand waar de app *naartoe
wilde* schrijven. Het werd pas zichtbaar toen 's avonds het bijwerkvenster de `EPERM` van
09:14 liet zien: `CaptureWriter.enqueue` ketende elke schrijfopdracht aan één promise
zonder `catch`, en `then` op een verworpen promise voert zijn callback niet uit en geeft
dezelfde verwerping door — voor altijd. Die ene verwerping wás sindsdien de wachtrij, en
`setBeforeInstall`'s `flush()` haalde hem er 's avonds weer uit.

Vier regels, en ze staan in die volgorde omdat elke volgende het gat dekt dat de vorige
laat vallen.

**Een mislukte schrijfopdracht is van zichzelf, niet van de wachtrij.** `enqueue` vangt nu,
en de fout reist mee op het `WriteResult` in plaats van als verwerping. Dat laatste is geen
netheid: `setHideHandler` roept `writer.finish()` kaal aan en `setBlurHandler` doet
`void writer.flush()`, dus een verwerping daar is een unhandled rejection en verder niets.
Het is ook waarom het bijwerkvenster een schrijffout meldde onder "Could not check for
updates" — die twee hoorden nooit door dezelfde `catch` te lopen.

**`EPERM` op een OneDrive-map is meestal tijdelijk of een attribuut, en dus wordt er opnieuw
geprobeerd.** `trash-delete.ts` wist dat al en deed het al; het pad dat *verwijdert* dus wel
en het pad dat *schrijft* niet, wat de verkeerde kant op is — een verwijdering die mislukt
is hinder, een schrijfopdracht die mislukt is werk dat weg is. Vijf pogingen, ~750 ms, en
tussendoor `clearReadOnly` op Windows: tegen een attribuut helpt wachten niet.

**De tijdelijke naam is uniek.** `${file}.tmp` was vast, dus overschreef de eerstvolgende
schrijfopdracht van dezelfde notitie de kopie die de mislukte had achtergelaten — de enige
kopie van de tekst die er nog was, opgeruimd door de app zelf zodra hij na de update weer
opstartte. Dezelfde vaste naam liet twee schrijfopdrachten van één notitie ook al met elkaar
racen; dat stond al beschreven in `test/capture-writer.test.ts` als een `ENOENT` die een
release deed vallen, en het was het kleinste van de twee gevolgen.

**En als het bestand echt niet weg kan, gaat de tekst ergens anders heen.** Naar
`userData/recovered/`, nadrukkelijk niet naar de kluis — de kluis is juist wat weigert. Dit
is de regel die deze notitie had gered: de volledige tekst zat de hele tijd in het document
van de renderer, en de app had geen plek waar hij hem kwijt wilde. Wat *niet* mag is de
tijdelijke kopie opruimen zonder dat die reddingskopie er staat; dan is opruimen precies
dezelfde fout in een kleiner jasje.

Beide vensters zeggen het nu ook. "Niet bewaard ({code})" neemt de plaats in van "Bewaard
als …" en van "Bewaard", en niet de plaats ernaast: een balk van 28 px leest als één regel,
en van een tegenspraak wordt de geruststellende helft geloofd.

Verworpen: alleen de `catch` toevoegen. Dan wordt één schrijfopdracht overgeslagen in plaats
van alle, wat beter is maar nog steeds stil verlies — en stil verlies is waar dit hele
besluit over gaat.

## B94 — De bibliotheek krijgt de volgorde die het oog leest, en vier dingen die daar bij horen

**Genomen** op 31 augustus 2026, na een ronde van dagelijks gebruik. Eén nummer voor één
ronde, en dat is hier uitzonderlijk: de code verwijst op ruim veertig plaatsen naar B94, en
de vijf stukken hieronder hangen aan elkaar via de balk onderin de notitielijst. Twee
knoppen verdwijnen uit de tabvolgorde omdat de tabvolgorde iets anders moet worden, en ze
krijgen een sneltoets terug omdat ze eruit zijn — dat is één afweging, geen drie.

### De ring is weer drie haltes, en Tab loopt de volgorde die je leest

Het notitiekopblok — Wanneer, Tags, Waar, Wie — was één release lang de vierde halte van
Ctrl+Tab (`shortcuts.ts`, `cyclePanes`). Het probleem dat dat oploste was echt: vanuit de
notitie, waar je een verkeerde datum ziet staan, was er geen weg terug omhoog. De prijs
werd betaald door elke druk die *niet* over die velden ging — van de lijst naar de notitie
liep voortaan door vier invoervelden heen.

**Dus: de velden gaan terug naar de gewone tabvolgorde, en krijgen een eigen akkoord.**
Mod+Shift+W (`focusFields`) landt op Wanneer, vanuit beide vensters, en Tab loopt vanaf daar
door de andere drie — vier velden, één toets, omdat het vier focusbare dingen in
documentvolgorde zijn en de browser dat al kan.

De volgorde is nu: mappen → notities → **de titel van de notitie** → Wanneer → Tags → Waar →
Wie → de notitie zelf, en achteruit precies andersom. De titel is voor het eerst een
tabhalte (Enter of spatie hernoemt, net als de klik); daarvoor was hij alleen met de muis en
met Mod+Shift+R te bereiken, wat hem tot het enige besturingselement tussen de lijst en de
velden maakte waar het toetsenbord langs liep.

Wat eruit moest om dat te laten kloppen: **de twee sleepstroken tussen de panelen en de twee
knoppen in de voet van de notitielijst** (sorteren, Taken). Vier drukken op niets, twee keer
per ronde. De stroken houden hun pijltjesbediening zodra je ze aanklikt; de twee knoppen
houden hun naam — `--click-button` en een schermlezer vinden ze nog steeds — en krijgen
Mod+T en Mod+S. Dat laatste is de ruil, en zonder die ruil zou dit een verwijdering zijn.

Van die acht stappen doet de app er zelf twee: mappen → notities, en notities → titel. De
andere zes zijn de browser, en dat is opzettelijk — een tabel van acht haltes zou een tweede
definitie zijn van een volgorde die het DOM al uitspreekt, en de eerste die ermee oneens
raakt zodra een paneel verandert.

**Verworpen:** Ctrl+Shift+Tab vanuit de notitie op Wie laten landen, zodat de omgekeerde
volgorde letterlijk waar blijft. Dan is de ring in de ene richting drie haltes en in de
andere vier, en twee richtingen die elkaar niet meer opheffen zijn een ring waar je over
moet nadenken.

**Verworpen:** Mod+Shift+T voor het Takenoverzicht, wat de voor de hand liggende letter is.
Dat akkoord is het taakregeltje in de editor, en de bibliotheek bevat de editor: allebei
zouden afgaan (B64's les over `preventDefault` die de bubbel niet stopt). Mod+T is vrij, is
dezelfde letter, en het verschil tussen "maak er één" en "toon ze allemaal" is precies één
Shift.

### De sorteerknop is twee knoppen: welke kant op, en waarvan

Eén knop bood drie velden aan en geen richting; de commentaarregel bij het pictogram zei
met zoveel woorden dat het géén richting mocht suggereren, omdat die er niet was. Nu wel:
de pijlen links keren de lijst om, de naam rechts kiest het veld.

`sortNotes` draait de **vergelijker** om en niet de gesorteerde rij. Een `reverse()` achteraf
keert ook de volgorde *binnen* elk gelijkspel om — twee notities in dezelfde seconde
bewaard, wat een plakactie zomaar oplevert — en de pinronde erna leunt erop dat de sortering
stabiel is.

Een veld kiezen zet de richting terug op die van dat veld (`NATURAL_SORT_DIRECTION`), zoals
de kolomkoppen van elke verkenner doen en zoals "Titel" A–Z blijft betekenen; hetzelfde veld
nog eens kiezen laat de pijlen staan, want "Gemaakt" kiezen in een menu dat al Gemaakt zegt
is geen verzoek om de vorige druk ongedaan te maken. Die drie standaarden zijn precies wat
de lijst deed toen er nog niets te kiezen viel.

**Verworpen:** één opgeslagen richting die over de velden heen blijft staan. Dan opent Titel
op Z–A omdat de datums een uur eerder omgekeerd zijn, en dan spreekt de lijst zijn eigen
label tegen.

### Meerdere notities tegelijk, voor Verplaatsen en Verwijderen

Een Inbox opruimen ging notitie voor notitie: slepen, wachten op de herlaadbeurt, de
volgende slepen. De lijst draagt nu een gemarkeerde verzameling, en er zijn twee dingen mee
te doen.

**Gemarkeerd is niet geselecteerd, en dat uit elkaar houden is het hele ontwerp.** De
notitie in de lezer is wat `selected` betekent, en daar is er precies één van; een gewone
klik opent er een, en daar is deze app voor. Een gemarkeerde verzameling is een tweede,
tijdelijk ding dat vrijwel altijd leeg is — een misklik met Ctrl kost dus niets en een
gewone klik maakt hem ongedaan.

Twee regels uit `multi-select.ts` zijn het noemen waard. De eerste Ctrl+klik neemt de
notitie die *open* staat mee, omdat die zichtbaar geselecteerd is en een verzameling die hem
stilletjes zou overslaan één notitie minder verwijdert dan het scherm zei. En een
verzameling van één klapt terug naar geen: één markering is de gewone toestand van een lijst
met één notitie open, en er één laten staan laat het paneel in een stand waarvan niemand kan
zien dat hij erin staat.

Een rechtsklik *binnen* de verzameling gaat over de verzameling en laat hem staan; elders
gaat hij over die regel en de markeringen verdwijnen. Het menu dat dan opengaat biedt alleen
wat meerdere notities kán betekenen: Hernoemen, Dupliceren, Vastprikken, Openen en Tonen
gaan over één notitie en zouden op de eerste regel moeten werken of stilletjes op één van
velen.

De sleeplading is voortaan één pad per regel — geen ontsnapping nodig, een kluispad kan geen
regelovergang bevatten — en één notitie reist nog steeds als een kaal pad, dus de indeling
veranderde niet onder een lezer die hem al kende. `canDropNotes` is bewust `some`: een
verzameling uit twee mappen die op één ervan valt heeft nog steeds iets te doen, en de drop
filtert per notitie zodat er niets verhuist wat `canDropNote` geweigerd zou hebben.

**Verworpen:** de verzameling in `NoteList` bewaren, naast de zwervende tabstop. Verplaatsen
en Verwijderen zijn de dialogen en de IPC-aanroepen van `Library.tsx`; een verzameling hier
zou op het moment van handelen omhoog gereikt moeten worden, wat één ding meer is om gelijk
te houden dan hem gewoon laten staan waar hij gebruikt wordt.

### Het venster verplaatsen aan de titel van de notitie

De titel in de lezer is `no-drag` in een balk die de greep van het randloze venster *is* —
wat hem klikbaar maakt, en wat de titelbalk wegnam bij het enige onderdeel dat eruitziet als
een titelbalk. Er is geen CSS die "allebei" uitdrukt: Chromium geeft elke druk binnen een
sleepgebied aan de vensterverplaatsing en nooit aan het element eronder.

Dus wordt de druk in de renderer bekeken en verplaatst main het venster (`IPC.windowDrag`).
Wat bepaalt welk gebaar het was, is afstand en niet tijd — een hand op een trackpad beweegt
tijdens het klikken een pixel of twee, en een druk die verder is gekomen was ergens
naartoe.

Twee dingen zijn het onthouden waard. Main neemt de afstand tussen venster en aanwijzer één
keer, bij `"start"`, en elk volgend bericht herstelt hem; het verschil optellen stapelt elke
afrondingsfout en elk verloren bericht op tot een venster dat uit de greep glijdt. En na een
sleep komt er wél een klik — het venster beweegt mee, dus druk en loslaten landen op
dezelfde kop en Chromium vuurt er één alsof er niets gebeurd is — dus die wordt
onderdrukt, anders opent het loslaten van een gesleepte titel elke keer de hernoeming.

**Verworpen:** de kop `-webkit-app-region: drag` geven en de klik ergens anders vandaan
halen. Dan is er geen klik: het element krijgt de druk niet te zien, wat precies de fout is
die `TODO.md` twee keer op rij vastlegt.

### Het sneltoetsenblad is doorzoekbaar, en de kolommen zijn gepakt in plaats van geknipt

Het blad is vierentwintig regels in twee kolommen: precies de lengte waarop lezen beter gaat
dan scannen, en precies de lengte waarop je geen van beide wilde — je kwam voor één toets.
`/`, één aanslag verder dan de Mod+/ die het blad opende, zet de cursor in een veld dat
filtert op de naam én op het akkoord *zoals het gedrukt staat*, zodat "ctrl alt t",
"ctrl+alt+t" en "tabel" alle drie dezelfde regel vinden.

De twee globale sneltoetsen waren opmaak op zichzelf, met een hardgecodeerde `+2` in de
balans om ze mee te tellen. Ze zijn nu gewone registeritems, gebouwd uit wat er is
ingesteld: een zoekopdracht die de toets waarmee je een notitie begint niet kan vinden, is
een zoekopdracht die het belangrijkste akkoord van de app weigert.

En `balanceColumns` knipt de groepenlijst niet meer op één plek door. Bij vijf groepen van
11, 8, 12, 4 en 13 regels is de beste doorlopende knip 19 tegen 29 — tien regels wit langs
één kant. Het weegt nu elke manier om de groepen over twee kolommen te verdelen en neemt de
kortste hoge kolom: 24 om 24 in de bibliotheek, 22 om 20 in het opnamevenster, in het echt
gemeten op 484 px om 484 px.

**Verworpen:** de doorlopende knip houden. Dat argument stond er zelf, en het klopte toen:
kolommen lees je naar beneden en dan naar rechts, dus een doorlopende knip laat de volgorde
van het register staan, en de winst was destijds één regel. De groepen zijn blijven groeien;
elke kolom leest nog steeds in registervolgorde, het blad als geheel niet meer.

### En één ding dat niets met toetsen te maken heeft: een leeg vinkvakje is geen taak

Het akkoord maakt het vakje vóórdat er staat waar het over gaat, dus droeg elke notitie die
werd geschreven een openstaande taak die niets zei: een regel in het Takenoverzicht die geen
taak noemt, en een getal op elk mapbadge erboven dat omhoogging zodra je begon te typen en
weer omlaag als je klaar was.

`isBlankTask` staat in het schema naast `taskItemsIn`, omdat drie wandelingen het vragen —
de indexopbouw, de telling in de prullenbakvraag en, via `note_tasks`, het overzicht zelf.
Een vakje dat in de ene wel en in de andere niet meetelt is erger dan één dat overal meetelt.

Het volgnummer wordt toegekend vóór het filter en blijft staan: het is een index in
`taskItemsIn`, waar `toggleTask` en `focusTaskAt` een item mee opzoeken in een document waar
de lege vakjes nog wél in staan. Hernummeren zou het verkeerde vinkje aanzetten.
`SCHEMA_VERSION` gaat naar 5 — de eerste keer op die lijst dat er rijen *weg* gaan, en
`needsRefresh` zou zo'n bestand niet opnieuw lezen omdat er niets aan bewogen is.

**Verworpen:** een leeg vakje mét een genest lijstje toch meetellen. Dat is een omhulsel: de
vakjes eronder tellen op zichzelf al, en de ouder meetellen telt hetzelfde werk twee keer.

## B95 — Een set verplaatsen is één handeling, en de app noemt haar eigen werk niet "van buitenaf"

**Genomen** op 1 september 2026, na een ronde van dagelijks gebruik. Vijf meldingen, waarvan
twee dezelfde bleken te zijn.

### Twee klachten, één naad

De meldingen: "meerdere notities verslepen duurt lang nadat je de muis loslaat", en "bij het
verplaatsen van meerdere notities verschijnt *deze notitie is buiten emqnote verwijderd*".
Ze staan hier onder één kopje omdat ze uit dezelfde regel kwamen.

`moveNotesTo` liep de set af en wachtte elke verplaatsing af — dacht het. De opmerking erboven
zei het met zoveel woorden: "één voor één, afgewacht, nooit parallel". Maar `runRelinkable`
was synchroon en gooide zijn belofte weg (`void performMove(...)`), dus de lus wachtte alleen
op de *vraag* naar de links en op niets daarna. Alle verplaatsingen liepen door elkaar.

Wat dat kostte, per notitie: één `linkingNotes` — en die loopt door `ensureScanned`, dat geen
geheugen heeft van een schone index en dus **de hele kluis opnieuw wandelt**, op Windows met
een `attrib … /s` erbij — plus een verplaatsing, plus een `library:refresh` uit main, plus de
twee die de watcher stuurt voor het verdwijnen en het verschijnen van het bestand. Elke
`library:refresh` laadt zeven dingen opnieuw. Zes notitities verplaatsen was zo'n dertig
wandelingen door de kluis.

En de tweede klacht is dezelfde lus, van de andere kant bekeken. De geopende notitie zit
normaal *in* de gemarkeerde set — `toggleMarked` begint de set met haar — en `performMove`
zette de lezer op `sorted[row - 1]`, de rij erboven. Bij een aaneengesloten selectie is dat
een andere notitie die óók weg gaat. De lezer stond dus op een pad dat de volgende
verplaatsing leeghaalde, en toen de `unlink` daarvan binnenkwam zei het venster dat iemand
anders die notitie had verwijderd.

Wat er nu staat: **`IPC.libraryMoveNotes` neemt de hele set**, met één `notifyLibrary()` aan
het eind, en `linkingNotes` neemt er ook een set — ontdubbeld op de *verwijzende* notitie,
want een notitie die naar drie van de zes wijst is één bestand om te herschrijven en één
antwoord op de vraag. De volgorde binnen de lus is de oude en blijft dragend: de verwijzingen
naar een notitie worden opgehaald vlak vóórdat *die* notitie verhuist, nooit één keer vooraf,
omdat twee notities in één set naar elkaar kunnen wijzen. De buurrij wordt gekozen met de set
eruit gefilterd. En de vraag over de links wordt één keer gesteld in plaats van per notitie —
wat meteen een fout oploste die niemand had gemeld: bij twee notities met inkomende links
overschreef de tweede `setDialog` de eerste, en alles behalve de laatste verhuisde stilletjes
niet.

`library:refresh` wordt bovendien samengevat: de eerste komt meteen door, alles wat binnen
60 ms volgt wordt één extra ronde. Voorrand en dan pas samenvatten, niet andersom — deze
wachttijd ligt op het pad tussen een vinkje aanzetten en het badge zien bewegen.

**Verworpen:** `ensureScanned` een geheugen geven. Dat is de grootste post, en het is ook de
enige die correctheid inruilt voor snelheid: overslaan betekent de watcher op zijn woord
geloven, en juist op Windows (B57) is dat waar dat woord al eens niet klopte. Van ~3n naar 2
wandelingen is dezelfde winst zonder die ruil.

### Een verplaatsing is geen verwijdering van buitenaf

`own-writes.ts` vergelijkt bytes (B31), en dat is precies waarom het deze vraag niet kon
beantwoorden: op een pad dat niet meer bestaat staan geen bytes. `index-watch.ts` schreef
daarom `own: false` op elke `unlink`, met een opmerking erboven die het uitlegde voor het
geval dat het niet was — hernoemen *over een bestaand pad heen* komt als `change` binnen. Een
notitie in een andere map zetten is dat niet: het bronpad is echt weg.

Ernaast staat nu een tweede, pad-gesleutelde notitie van wat de app zelf deed:
`rememberOwnMove(from, to)`, gelezen door `wasOwnRemoval` en `wasOwnArrival`. Geen tijdklok —
"deze app heeft dat bestand verplaatst" blijft waar, hoe lang de watcher er ook over doet, en
dat is waar B31 tegen een TTL argumenteerde. Niet-verbruikend en met dezelfde LRU-grens als
de hashes, om `wasOwnWrite`'s reden: chokidar kan `add` en `change` sturen voor één aankomst.
`moveNote`, `renameNote` en `trashNote` schrijven het op — die laatste hield tot nu toe
helemaal niets bij, de enige verplaatser in het bestand zonder boekhouding.

**En de index wordt hoe dan ook bijgewerkt.** Alleen de melding wordt onderdrukt, nooit het
opruimen — B31's regel, letterlijk.

Wat dit *niet* is: de reparatie van de meldingen hierboven. Met de set-verplaatsing erbij
staat de lezer niet meer op een pad dat leegloopt, en `npm run drive:library` blijft groen
als je deze onderdrukking eruit haalt — een kluis van vier notities onder Xvfb herlaadt
sneller dan chokidar's 300 ms. Op een echte kluis niet, en dat is waarom de twee klachten
samen binnenkwamen: hoe trager de verplaatsing, hoe breder het venster waarin het venster
iets onwaars kan zeggen. Deze helft is vastgelegd waar hij wél te beslissen is, in
`index-watch.test.ts` en `vault-io.test.ts`.

### De vensterknoppen staan boven wat er ook maar in de bovenste band staat

`.pane-header-caption` hield de titel van de leespaneel vrij van de knoppen die Windows 11 in
de band tekent. Maar het bibliotheekvenster is geen drie panelen op y=0: `.library-shell`
stapelt tot drie balken over de volle breedte *boven* het raster — de scanbalk, de
conflictbalk en de schijfwijzigingsbalk — en die duwen de kopbanden omlaag terwijl de knoppen
op y=0 blijven staan. De schijfwijzigingsbalk zet Herladen / Sluiten / Mijn versie behouden
met `space-between` tegen de rechterrand, precies eronder. Dat is de melding.

`--caption-inset` staat nu één keer in `:root` en wordt door alle vier gelezen. De inspring
van de leeskop **blijft staan als er een balk boven hangt**: de scanbalk is zo'n 22 px en de
overlay 40, dus de bovenste helft van die kop zit er nog steeds onder. Slim zijn kost hier een
titel onder Sluiten; niet slim zijn kost een gat rechts naast een titel die toch links staat.

**Verworpen:** de balken onder het raster hangen. Ze gaan over het venster, niet over een
paneel, en een conflictmelding onderaan is een conflictmelding die je niet ziet.

### Een leeg leespaneel houdt zijn twee banden

B92 tekent één lijn over de bovenkant en één over de onderkant van het venster, uit één
regel per band. Zonder geopende notitie tekende het leespaneel geen van beide, en dan houden
allebei die lijnen een derde van het venster voor het einde op — wat leest als afgesneden
chrome, niet als een paneel waar niets in zit. Er staat nu een `PaneHeader` en een
`PaneFooter` omheen, allebei leeg.

De titel is `null` en niet `""`: bij een string tekent `PaneHeader` een `<h2
class="pane-title">`, en een lege daarvan is een echt element dat `focusPane("title")` vindt
— Tab uit de notitielijst zou dan op een kop landen in een paneel zonder notitie.

De bestandsweergave (B47) had hetzelfde probleem én een eigen idee over hoe hoog chrome is:
een eigen balk met eigen padding en geen voet. Dat was het vierde idee waar B92 er één van
wilde maken. Het is nu dezelfde `PaneHeader` — met `captionButtons`, dus Openen en Tonen
staan niet langer onder Sluiten — en een `PaneFooter` met het pad erin.

### Mod+T zet de takenweergave aan én uit

Het akkoord opende de weergave en had geen weg terug: een tweede druk zette dezelfde selectie
opnieuw en er bewoog niets. Het is nu een schakelaar, en het akkoord is de enige route die
dat kán zijn — de notitielijst is weg zolang de takenweergave er staat, dus de knop die haar
opende is niet meer op het scherm om haar te sluiten. De weg naar buiten is `exitTasks`,
dezelfde functie als Escape en de knop Takenweergave sluiten, zodat er nog steeds precies één
is.

**Verworpen:** de rij in de zijbalk ook laten schakelen. Een maprij die zichzelf uitzet bij
een tweede klik doet iets anders dan elke maprij ernaast.

---

## B96 — Wat je kopieert houdt zijn vinkje, ook buiten dit venster

**Genomen** op 1 september 2026, uit dagelijks gebruik. De melding: bij het plakken in een
andere toepassing worden vinkjes bullets, koppen krijgen de grootte van gewone tekst en
markeringen verdwijnen.

### Waarom een decoratie nooit meekopieert

Het `text/plain`-smaakje was al eens gerepareerd (`clipboard-text.ts`), en de opmerking
erboven zei: het `text/html`-smaakje was altijd al goed. Dat klopte niet, en de reden staat
in dit logboek al twee keer eerder beschreven zonder dat iemand de conclusie trok.

Een taakregel draagt haar staat als **attribuut** — `data-checked` op de `<li>`, `data-starred`
voor B72's ster — en het vakje dat je in de editor ziet is een *widget-decoratie*
(`checkbox.ts`). Een decoratie staat naast het document en maakt er geen deel van uit; dat is
precies waarom `link-title.ts` er een is. Geen enkele serializer kan er dus bij. Op het
klembord stond `<li data-checked="true"><p>Klaar</p></li>`: één attribuut dat alleen deze app
leest, en verder een bullet als elke andere. Aangevinkt en niet-aangevinkt kwamen in de mail
als hetzelfde streepje aan. Dat is echte informatie die verdwijnt — de andere twee klachten
zijn opmaak, deze niet.

`<mark>` is HTML5 en Word — en Word ís de tekstverwerker onder een Outlook-bericht — pakt uit
wat het niet kent: de tag verdween en de markering ermee. Een `<h1>` zonder eigen stijl is zo
groot als de bestemming vindt dat hij is, en dat was body-grootte.

### Wat er nu staat

`clipboard-html.ts`, een `clipboardSerializer` naast het bestaande
`clipboardTextSerializer`, en één pas over wat `DOMSerializer.fromSchema` heeft opgeleverd.
Drie regels dragen het:

**`toDOM` blijft ongemoeid.** Dat is tegelijk de tekening van de editor, de heenweg van
kopiëren-en-plakken *binnen* deze app (`readChecked` is de terugweg) en het schema van het
bestandsformaat — B6. Een tweede definitie daarvan zou precies het soort drift zijn waar B6
tegen is. ProseMirror heeft voor dit verschil één prop, en dit is hem.

**Een glyph is een plaatje van een attribuut, nooit een tweede definitie ervan.** De `☑`
komt náást `data-checked` te staan en draagt `data-emq-clip`, waar `schema.ts` een
`ignore`-regel voor heeft. Zonder die regel levert kopiëren en terugplakken in dezelfde app
een letterlijke `☑` in de tekst mét een echt vakje ernaast — de bekende vorm van deze fout,
en de reden dat `readChecked` überhaupt bestaat.

**Elke stijl staat op het element én op een `<span>` erbinnen.** Een bestemming die de tag
kent leest hem daar af; een die hem uitpakt (Word, bij `<mark>`) houdt de span over. En
`font-weight`, `font-style` en `text-decoration` worden **nergens** geschreven: `schema.ts`
leest die drie als marks, dus een kop die vet meegaat komt bij het terugplakken terug als een
kop vol `**vet**` — een fout die het bestand in gaat, niet een die je alleen ziet.

Het vakje is hier wél getypt en niet getekend, tegen het argument in dat in `checkbox.ts`
staat (☐ en ☑ komen uit verschillende fallback-fonts en passen niet bij elkaar). Dat argument
geldt nog steeds en helpt hier niet: inline SVG wordt door elke mailclient gestript en een
`data:`-afbeelding blokkeert Outlook. Wat de bestemming wél kan krijgen is een teken.

**Verworpen:** `<input type="checkbox" checked disabled>`, zoals GitHub het schrijft.
`readChecked` leest die vorm al, dus de terugweg zou gratis zijn — maar een uitgeschakeld
formulierveld tekent Word niet en Gmail strippen het. Het vakje moet tekst zijn om overal aan
te komen.

**Verworpen:** een `background-color`-regel in `schema.ts` waardoor gemarkeerde tekst uit
Outlook *terug* als `==markering==` binnenkomt. Verleidelijk, want het is dezelfde naad van de
andere kant — maar dan wordt elke gele achtergrond uit elke geplakte webpagina een markering,
en dat is een andere beslissing dan deze.

## B97 — Bij een `data:`-adres beslissen de bytes, en het etiket telt niet mee

**Genomen** op 1 september 2026, uit dagelijks gebruik. De melding: een notitie met
`![|1282x293](data:image/png;base64,R0lGODdh…)` erin tekent geen plaatje maar het grijze
chipje, terwijl de hele afbeelding gewoon in de tekst van het bestand staat.

### Waarom dat plaatje geweigerd werd

De eerste bytes van dat adres zijn niet die van een PNG. `R0lGODdh` is base64 voor `GIF87a`,
en verderop staat `Software: Microsoft Office` in het commentaarblok. Het is een GIF, met
`image/png` op het etiket — en zo schrijft Word het, en Outlook, en dat is niet zeldzaam maar
het normale geval.

`typesAgree` in `remote-image.ts` eist dat het opgegeven type en de magische bytes hetzelfde
zeggen, en dat is een goede regel: een server die PNG zegt en iets anders stuurt is stuk of
liegt, en geen van beide is een bestand dat deze app in de kluis zet onder een naam die hij
zelf verzonnen heeft. Alleen — bij een `data:`-adres is er geen server. Het etiket en de
inhoud zijn twee helften van één string, allebei door dezelfde hand geschreven. Een verschil
tussen die twee bewijst niets, en wie PNG-bytes geserveerd wilde krijgen had eenvoudig een
PNG kunnen schrijven. De regel beschermde tegen niemand en weigerde ondertussen echte
notities.

### Wat er nu staat

`acceptedExtension(declared, bytes, origin)` — één functie, twee herkomsten. `"network"` is
de regel van hierboven, ongewijzigd. `"inline"` — een `data:`-adres — **negeert het etiket en
leest de bytes**. Daarmee komt ook `data:;base64,…` binnen, de RFC-vorm die helemaal geen
type noemt (`text/plain` per definitie) en dus nooit langs een controle kon die er een eiste.

Wat níét meebuigt: de bytes moeten nog steeds *snuiven* als een van de toegestane types. Een
SVG heeft geen magisch nummer en kan dus nooit ergens als snuiven — de asymmetrie die
`remote-image.ts` uitschrijft (de kiezer mag er wel een, een geplakte pagina niet, want
`openAttachment` geeft een bijlage aan een viewer waar script in een SVG draait) blijft
precies zoals hij was. De extensie komt nog steeds van de bytes en nooit van het etiket, dus
de cache krijgt nooit een bestand met een naam die over zijn eigen inhoud liegt.

### En de schakelaar staat er niet meer voor

"Afbeeldingen van het web laden" (B50) gaat over dít proces dat een host benadert omdat een
notitie daarom vraagt. Een base64-plaatje noemt geen host, kost geen verzoek en staat al in
het bestand dat de lezer open heeft. Die schakelaar uitzetten zou dan een stuk van de eigen
tekst van de notitie zwart maken om te beschermen tegen een verzoek dat nooit plaatsvindt.
Dus: `data:` valt buiten de schakelaar, in main én in de renderer, om dezelfde reden dat de
renderer überhaupt een kopie van die instelling heeft.

Eén kleinigheid hoort er nog bij: het adres stond als `title` op zowel het chipje als het
plaatje, en bij een `data:`-adres is dat het plaatje zélf — tienduizenden tekens base64 in
een tooltip die niemand kan lezen en die niets vertelt over waar de afbeelding vandaan komt,
want die komt uit deze notitie. Bij een `data:`-adres staat er nu geen `title`.

**Verworpen:** `data:` toevoegen aan `img-src` van het opnamevenster en het plaatje direct in
de `<img>` zetten. Dat is de regel van één regel, en hij haalt de snuif, de bovengrens en de
enige plek waar over dit soort adressen beslist wordt uit de weg — precies wat B50 in main
heeft gezet. De bibliotheek staat `data:` al toe en het opnamevenster niet; die asymmetrie
opheffen door de strengste van de twee te versoepelen is de verkeerde kant op.

**Verworpen:** het etiket aanhouden en de gebruiker vertellen dat het plaatje "beschadigd" is.
Het plaatje is niet beschadigd. Chromium tekent het zonder klagen zodra iemand het hem geeft,
en dat is ook wat Obsidian met hetzelfde bestand doet — B7.

### Het bestandsformaat wist het al

Aan de markdown-kant hoefde niets. `parseNote`/`serializeNote` laten een `data:`-adres al
byte voor byte door, gleufje en al, en dat is nu ook zo opgeschreven: `30-afbeeldingsformaat.md`
in de corpus draagt de gemelde vorm en twee varianten ernaast, en `03-markdown-dialect.md` §5
zegt het uit. Wat deze app zélf schrijft blijft geen base64 — een geplakte afbeelding wordt
een bestand in `_attachments/` (B28). Een `data:`-adres komt van buiten, en blijft.

### Wat het bewijst

`scripts/drive-capture.ts` heeft er een stap bij: dezelfde vorm in de fixture-notitie, en de
assertie is `naturalWidth`, niet het bestaan van een `<img>`. Geen enkele test onder `test/`
kan dit zien — jsdom laadt geen afbeeldingen — en de fout waar het om gaat is juist het
*chipje*: de notitie blijft er opzettelijk uitzien terwijl het plaatje nooit getekend wordt.
Met de fix eruit gedraaid faalt die stap ook echt, en met de woorden uit de melding.

---

## B98 — Tab gaat naar de notitie, Ctrl+Tab naar de titel, en de vensterfocus komt terug

**Genomen** op 1 september 2026, uit dagelijks gebruik. Vijf meldingen, geen gedeelde
oorzaak; twee ervan gaan over hetzelfde onderwerp en zijn samen beslist.

### Tab en Ctrl+Tab ruilen van baan

B94 gaf de bibliotheek de volgorde die het oog leest: mappen → notities → titel → Wanneer →
Labels → Waar → Wie → de notitie. Dat klopte als beschrijving en bleek verkeerd als
gereedschap. Waar je heen wilt is bijna altijd de tekst van de notitie, en dat waren vijf
aanslagen — vier daarvan door velden waar je niet was en niet heen wilde.

Dus ruilen de twee gebaren van baan. **Tab uit de notitielijst landt in de tekst van de
notitie.** **Ctrl+Tab uit de notitielijst landt op de titel.** Dat is geen halte die erbij
komt maar één die van toets wisselt: de titel was al bereikbaar, de vraag was met welke
toets. En hij past bij die toets — een titel is een bestemming die je vraagt, de tekst is
waar je toch al heen ging.

De ring wordt daarmee vier haltes vooruit en drie terug:

```
vooruit   mappen → notities → titel → notitie → mappen
terug     mappen → notitie → notities → mappen
```

Die asymmetrie is niet slordigheid. Terug uit de notitie betekent terug naar de lijst waar je
vandaan kwam; de titel onderweg meepakken zou de terugweg langer maken dan de heenweg zonder
dat iemand daarom vroeg.

**Dit is niet de vierde halte die B94 weghaalde.** Dat was het *kopblok* — Wanneer, Labels,
Waar, Wie — in beide richtingen, en dat werd betaald door elke aanslag die niet over die
velden ging. `focusFields` (Mod+Shift+W) verving het en doet dat nog steeds. De titel kost
één aanslag op één route, en dat is precies de route waar om gevraagd is.

### Wat het kost, en wat de vier velden overhouden

Eerlijk opgeschreven: de vier velden hebben geen route meer vanuit de lijst die geen akkoord
is. Ze houden er drie: Tab verder vanaf de titel (waar Ctrl+Tab je zet), `focusFields` vanuit
elk venster in één aanslag, en de muis. De ring gáát er nog steeds doorheen — een aanslag
vanuit een van de velden gaat vooruit naar de notitie en terug naar de lijst — hij landt er
alleen nooit. Dat is `inNoteFields`, niet `paneOf`, en dat onderscheid staat er sinds B94 om
precies deze reden.

### Ctrl+Shift+Tab in de mappenlijst deed niets

Tweede melding, dezelfde functie. De mappenlijst was de eerste halte van de ring en teruggaan
vanaf de eerste halte was `null`: de aanslag deed letterlijk niets. Nu gaat hij naar de tekst
van de open notitie.

En daarmee komt de vraag boven wat er moet gebeuren als er geen notitie open is. Het antwoord
is één regel, en die vervangt de `null`-tak: **een stap zonder plek om te landen doet niets.**
`focusPane` zegt of hij verplaatst heeft, `cycle` geeft dat antwoord door in plaats van `true`,
en daarmee is "doe niets als er geen notitie actief is" geen aparte tak maar hetzelfde
mechanisme dat de titel en het kopblok al gebruikten.

Daar zat één leugen in de weg: `focusPane("editor")` gaf altijd `true`, ook als er helemaal
geen editor gemonteerd was — met een lege lezer is die er niet. Dat viel niet op zolang de
notitie de *derde* Tab-halte was, en valt onmiddellijk op zodra Tab en de ring er recht op
mikken.

**Verworpen:** doorlopen naar de volgende halte die wél iemand kan ontvangen. Dat is
verdedigbaar en het is een ander gebaar: Ctrl+Shift+Tab in de mappenlijst zou dan in de
notitielijst eindigen, wat een antwoord is op een vraag die niet gesteld is.

### Focus komt terug in het venster dat het opnamevenster opriep

Derde melding: een notitie beginnen met Mod+N in de bibliotheek, afsluiten met Ctrl+Enter, en
dan alt-tabben om terug te zijn waar je was. `hideCaptureWindow` deed `hide()` en verder
niets; het besturingssysteem koos maar wat.

Het onderscheid dat hiervoor nodig is stond er al en was alleen niet opgeschreven:
`showCaptureWindow` is de sneltoets, het pictogram en de tweede instantie, en
`focusCaptureWindow` is de bibliotheek en niets anders — beide routes van dat venster
(`IPC.captureNew`, `IPC.captureLoad`) gaan erlangs. Eén `raisedByLibrary` naast de twee
handlers, gezet door de een en gewist door de ander, en `hideCaptureWindow` geeft de focus
terug als hij gezet stond.

**Verworpen:** altijd de bibliotheek naar voren halen als er een is. Dat maakt van een notitie
die je vanuit Outlook met de sneltoets typt een reden om de notitiebrowser in beeld te
trekken, en dat is een ergere fout dan degene die hier opgelost wordt.

**Verworpen:** ook onthouden welke *andere applicatie* voor de sneltoets vooraan stond en die
teruggeven. Dat is een ander verzoek dan het gemelde, en de Windows-helft ervan is een gevecht
met de voorgrondregels dat geen enkele melding vraagt.

Het wordt gewist door `showCaptureWindow` en niet alleen verbruikt door `hideCaptureWindow`,
zodat een sneltoets-notitie een uur later de bibliotheek niet alsnog naar voren haalt — en
zodat `selftest.ts`, dat vijftig keer achter elkaar toont en verbergt, geen enkel venster
optilt.

### "Controleren op updates" zegt nu dat hij bezig is

Vierde melding: je klikt en er gebeurt niets, tot er ineens een dialoog staat. Dat is precies
wat het is — `IPC.checkForUpdates` lost op zodra de controle *gestart* is, met opzet, omdat op
Windows dezelfde aanroep pas klaar is als de gebruiker een download heeft beantwoord. Er was
alleen niets wat het tussenliggende moment beschreef.

`IPC.updateCheckState` doet dat, en draagt een `boolean` en verder niets. **Het is nadrukkelijk
niet de uitslag**: elke uitkomst blijft de systeemdialoog die `updater.ts` opwerpt. De knop
staat uit en leest "Bezig met controleren…" zolang hij waar is.

`false` betekent dat de *controle* voorbij is, niet de update. Op Windows volgen daarna nog een
download en een herstartvraag, en een knop die daar doorheen "bezig met controleren" bleef
zeggen zou iets beschrijven dat minuten eerder klaar was. Alle vijf uitkomsten van die module
zijn een `showMessageBox`, dus loopt er één `announce` voor die vijf langs die de controle
beëindigt — één plek in plaats van een vlag die op vijf takken bijgehouden moet worden.

De toestand komt van main en wordt niet hier op de klik gezet, want het pictogram in de
systeembalk start dezelfde controle; een vlag in het paneel zou de helft ervan beschrijven.

**Verworpen:** een modale "bezig met controleren"-dialoog, wat de melding zelf voorstelde.
`dialog.showMessageBox` gaat niet vanuit code weer dicht, en op Windows zou hij vóór de
uitkomst blijven staan die hij aankondigde.

### Een plaatje met een opgegeven hoogte houdt zijn vorm

Vijfde melding: een base64-plaatje schaalt alleen in de breedte mee met het venster.

Het is geen base64-fout. `![|1282x293](data:…)` is wat Word en Outlook schrijven, en het
bijzondere eraan is het *paar*: een breedte én een hoogte. `applySize` zette die als
`width: 1282px; height: 293px` inline op het plaatje. `.wiki-embed-image` heeft
`max-width: 100%`, dus de breedte kwam mee omlaag met de kolom — en de inline hoogte bleef
staan, want een inline declaratie wint van de stylesheet, ook van de `height: auto` die daar
precies voor bedoeld was. Wat je zag was `kolombreedte × 293`.

Het staat er nu als een verhouding: `aspect-ratio: 1282 / 293` met `height: auto`. Dat zegt de
vorm zonder een maat te zeggen — bij volle breedte tekent het exact het vak dat het bestand
vraagt, en onder de bovengrens neemt het de hoogte mee naar beneden. B97 heeft hier niets mee
te maken behalve de aanleiding: die maakte dat zulke plaatjes überhaupt *getekend* werden, en
Office is nu eenmaal de bron die een paar schrijft in plaats van één getal. Dezelfde fout zat
in `![[foto.png|250x180]]`, want beide gaan door dezelfde functie.

**Verworpen:** `height: auto !important` in de stylesheet. Dat gooit de hoogte die iemand
opgeschreven heeft helemaal weg, en de regel dat een hoogte die een ander schreef bewaard
blijft (B74) is nu juist de reden dat er iets te bewaren viel.

### Wat het bewijst

`npm run drive:library` heeft er twee stappen bij — een echte Ctrl+Tab die op de titel landt en
een echte Ctrl+Shift+Tab uit de mappenlijst die in de tekst landt — en de bestaande Tab-wandeling
is van acht haltes naar twee gegaan. Dat is ook de enige plek waar het akkoord van begin tot eind
loopt: main claimt Ctrl+Tab in `before-input-event`, dus de jsdom-suite kan alleen de doorgestuurde
handler aanroepen.

**Die twee stappen moesten met `xdotool` geschreven worden**, en dat is het onthouden waard. Elk
ander akkoord in dat script is een CDP-`Input.dispatchKeyEvent`, en die komt op de *pagina* uit —
waar Mod+T, Mod+S en Mod+Shift+W afgehandeld worden. Ctrl+Tab wordt in main geclaimd, en een via
CDP ingespoten toets komt daar nooit langs: op de voor de hand liggende manier geschreven bleef de
focus staan waar hij stond en zag de stap eruit als een kapotte fix. Echte XTEST-toetsen lopen wél
door de pijplijn waar de claim in zit — precies de reden dat die claim daarheen verhuisd is — dus
moet het venster eerst X-focus hebben, gevonden via een gestempelde `document.title`, om de reden
die `drive-capture.ts` al had: elk venster van deze app heet "emqnote".

`npm run drive:capture` heeft er één bij, en die meet het getekende rechthoekje: jsdom heeft geen
opmaak, dus `test/image-stored-size.test.ts` kan zeggen wat er in `img.style` terechtkomt en niets
over wat de browser er dan van maakt. Hier gemeten: `547×125, 4.38:1` mét de fix, en met de fix
eruit gedraaid `drawn 547×293 is 1.87:1` — de kolombreedte bij de hoogte die het bestand opgaf,
wat de melding in één regel is.

Van de vijf is er één die nergens automatisch heen kan: welk venster na Ctrl+Enter de focus
heeft, is vensterstaat van Electron en geen van beide drivers kan het vragen.
`TEST-PROTOCOL.md` §52 heeft het, op beide platforms.
