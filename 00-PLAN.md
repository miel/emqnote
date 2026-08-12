# emqnote — plan

Een kleine, snelle notitie-app voor werk, die de "mail naar mezelf"-routine overbodig maakt.
Opslag: markdown-bestanden in mappen op de zakelijke OneDrive.

## De documenten

| Document | Waarvoor |
|---|---|
| [01-functioneel-ontwerp.md](01-functioneel-ontwerp.md) | Wat de app doet, gezien vanuit gebruik |
| [02-technisch-ontwerp.md](02-technisch-ontwerp.md) | Hoe het in elkaar zit |
| [03-markdown-dialect.md](03-markdown-dialect.md) | Het vault-formaat als specificatie |
| [04-bouwplan.md](04-bouwplan.md) | Fasen met acceptatiecriteria |
| [05-besluitenlog.md](05-besluitenlog.md) | Besluiten, afwegingen, wat is afgevallen |

## De kern in tien regels

De huidige routine — global shortcut, nieuwe mail in Outlook, typen met vertrouwde
sneltoetsen, naar jezelf sturen — wint op twee punten: **snelheid** en **vingergevoel**.
Elke vervanger die daarop verliest, wordt niet gebruikt. Daarom:

1. **Resident.** De app draait altijd, met een voorgerenderd verborgen venster.
   Hotkey → cursor in **< 80 ms**. Gemeten, niet gehoopt.
2. **Outlook-sneltoetsen, letterlijk.** Ctrl+B/I/U, Ctrl+Shift+L, Tab/Shift+Tab,
   Ctrl+Alt+1/2/3, Shift+Enter. Geen heropvoeding.
3. **Outlines die werken.** Gemengde bullets en nummering, meerdere niveaus,
   alinea's ingesprongen onder een bullet. Dit is waar Obsidian faalde.
4. **Nooit markdown-tekens in beeld.** Markdown is het opslagformaat, niet de
   bewerkingservaring.
5. **Platte bestanden op OneDrive.** Blijft binnen de werkomgeving, blijft leesbaar
   in Obsidian als de app ooit stukloopt.

## Stand van zaken

| Fase | Stand |
|---|---|
| −1 Go/no-go | Ongetekende Electron-app start op de werkmachine — bevestigd |
| 0 Markdown-rondgang | Bytegelijk in beide richtingen, 27 corpusbestanden |
| 1 Residente schil | Tray, hotkey, voorgeladen venster, opslaan naar de Inbox |
| 2 Editor | ProseMirror, Outlook-sneltoetsen, outlines, kopblok |
| 3 Hoofdvenster | **Klaar.** Mappenboom, notitielijst, lezen en bewerken, verplaatsen, prullenbak, en sinds 4 augustus 2026 ook slepen in de boom — het laatste werk-item van deze fase |
| 4 Plakken en afbeeldingen | **Gesplitst, en meer ervan is klaar.** Afbeeldingen plakken, slepen of kiezen landde op 5 augustus. Een afbeelding die meekomt met een geplakte webpagina wordt sinds 7 augustus ook gedownload naar `_attachments/`, via een tegen SSRF beveiligde pijplijn. Plakken vanuit Outlook (`mso-list`) blijft bewust uitgesteld — het grootste onbekende stuk werk resteert daar |
| 5 Zoeken en synchronisatie | **Klaar.** SQLite/FTS5-index, volledige scan, `chokidar`-watcher, zoekbalk, conflictbanner met verschil en drie keuzes, opruimscherm voor verweesde bijlagen — alles bevestigd werkend via `Xvfb`, echte bestandsoperaties op schijf, niet alleen gerenderd |
| 6 E-mail | Nog niet begonnen |

Sinds `v0.1.0` landde ook, buiten dit fasenplan om, **B22**: een Windows-installer met
auto-updater (05-besluitenlog.md). Actuele versie: `v0.5.0` — vier pakketten werk, gebouwd
in twee golven door parallelle agents, op basis van `v0.4.1`.

Op 12 augustus 2026 landden drie functies uit het dagelijks gebruik, alle drie met een
besluit: **B40** — een PDF wordt in de app zelf gelezen, in een eigen venster, in plaats van
alleen als miniatuur te bestaan — **B41** — een `[[…]]`-verwijzing wordt geschreven door een
notitie te kiezen, met `[[` of `Mod+Shift+K`, in beide vensters — en **B42** — tabellen
kunnen gemaakt en bewerkt worden, met de hand gebouwd op het schema dat er al stond, wat
meteen de vraag beantwoordt die B17 open liet over `prosemirror-tables`. Alle drie zijn
onder `Xvfb` in de echte app bevestigd, inclusief werkelijke inkt op het canvas van de
PDF-lezer en een opgeslagen tabel die byte-identiek terugkomt uit `npm run canonical`. Wat
een mens nog moet nakijken staat in `TEST-PROTOCOL.md` §12–§14; het opnamevenster blijft de
ene plek zonder testharnas.

Op 7 augustus 2026 landden vier pakketten: plakken van een webafbeelding (pakket A),
miniaturen voor PDF- en Office-bijlagen (pakket B, **B30**), een melding wanneer een open
notitie buiten de app verandert of verdwijnt (pakket C, **B31**) en rechtsklikmenu's met
volledige toetsenbordnavigatie in de bibliotheek (pakket D). Pakket A downloadt een
afbeelding die meekomt met een geplakte webpagina naar `_attachments/` in plaats van hem
als een dode `https://`-koppeling te laten staan, via een pijplijn die op elke stap
opnieuw controleert wat een omleiding mag aanwijzen — de enige weg tussen een geplakte URL
en `file:///etc/passwd`. Pakket C onderscheidt de eigen schrijfactie van de app van een
echte externe wijziging met een inhoudshash in plaats van een tijdvenster, precies omdat
OneDrive's eigen herschrijfmoment geen klok is die deze app kan vertrouwen. Bevestigd in de
echte app onder `Xvfb`: een geplakte afbeelding die daadwerkelijk download en inline
tekent in de bibliotheek-lezer; het hele pad van de wijzigingsmelding in de bibliotheek
(stille herlaad, de Reload/Behoud-de-mijne-balk, de Sluiten/Behoud-de-mijne-balk, en geen
enkele valse melding na een minuut doorlopend typen); de drie rechtsklikmenu's; en volledige
toetsenbordnavigatie. Niet bevestigd: hetzelfde plakken in het opnamevenster zelf, en de
knopvrije melding die dat venster zou moeten tonen — `TEST-PROTOCOL.md` beschrijft beide.

Op 6 augustus 2026 landden, na `v0.4.0`, nog eens acht correcties uit het dagelijks
gebruik, als `v0.4.1`: het opnamevenster hernoemt zijn bestand nu pas bij het afronden
(Ctrl+Enter, sluiten of afsluiten) als het onderwerp intussen is gewijzigd, in plaats van
nooit; de titel in de lezer is nu direct te bewerken door erop te klikken, met dezelfde
vergrendelingscontrole die verplaatsen en afvinken al hadden; de editor heeft nu ruimte om
voorbij de laatste regel te scrollen; een pijltoets brengt de cursor nu langs een
ingevoegde afbeelding of PDF-koppeling in plaats van hem onzichtbaar te maken; een klik op
een taak in het takenoverzicht zet de cursor op die taak in de lezer, zonder de lijst te
verlaten; Taken en Prullenbak zijn in de mappenboom van plaats gewisseld; Verweesde
bijlagen verhuisde van de mappenboom naar de instellingen; en het invoegen van een grote
PDF bevriest de app niet langer, doordat het kopiëren niet meer op de hoofdthread gebeurt.

Op 5 augustus 2026 landden vijf dingen uit het dagelijks gebruik, als PR #2: een
takenoverzicht over alle notities in een map en zijn submappen, met afvinken vanuit die
lijst; *Map verwijderen*, met een waarschuwing die noemt wat er meegaat; versleepbare
kolombreedtes in de bibliotheek, die een herstart overleven; en het invoegen van een
afbeelding of een PDF via plakken, slepen of de bestandskiezer. Drie ervan staan als
besluit vast: **B26** (taken zijn een eigen weergave en hun status staat in de index),
**B27** (een map verwijderen is een verhuizing naar de prullenbak) en **B28** (bijlagen
komen er via één weg in, geserveerd via een eigen protocol). Twee onderdelen zijn wel
gebouwd maar nooit werkend gezien — of het opnamevenster een bijlage werkelijk tekent, en
de klik die het afvinken aanroept; `TEST-PROTOCOL.md` beschrijft hoe je die met de hand
nagaat.

Op 6 augustus 2026 volgden zes correcties uit het gebruik van de `v0.3.3`-release. Twee
van de acht meldingen waren geen fout: het takenoverzicht en *Map verwijderen* zaten in
PR #2, en PR #2 was nooit getagd — `v0.4.0` is de release die dat rechtzet. De zes echte:
een leeg vakje overleeft nu een opslagbeurt (`- [ ]`, wat GFM op zichzelf niet als taak
terugleest), een lijst blijft één lijst als je er in het midden een item uit haalt,
een notitie kan in elke map worden aangemaakt — ook in de wortel van de vault — en
verplaatsen laat de boom staan waar hij stond (samen **B29**), een gekopieerde lijst neemt
zijn bullets, nummers en vakjes mee naar het klembord, en de rij waar een sleep begon
vervaagt zolang die in de lucht hangt.

Op 3 augustus 2026 volgde een reeks van negen correcties uit het gebruik van de
macOS-release, waarvan er drie één oorzaak deelden: het opnamevenster ving zijn eigen
`close` niet af, dus de rode stoplichtknop vernietigde het en nam de hotkey en de
notitievergrendeling mee. Drie ervan staan als besluit vast: **B23** (de vergaderknop
verdwijnt, `type:` blijft in het formaat), **B24** (de prullenbak kan met de hand
definitief geleegd worden) en **B25** (Cmd+Q sluit een venster, het beëindigt de app
niet).

Actuele hotkey→cursor-metingen staan in `CLAUDE.md`, met machine en beeldscherm erbij —
dat hoort erbij, een getal zonder die twee betekent niets. Laatste stand: Mac mini M4 op
een 60 Hz scherm, p50 27–31 ms, p95 36–45 ms, tegen een budget van 80 ms — de helft van
de fase-3-meting op dezelfde machine, en nog niet verklaard waarom. Windows heeft nog
geen betrouwbare reeks, zie punt 2 hieronder.

```bash
npm test           # vitest run
npm run typecheck
npm run dev        # draaien tijdens ontwikkelen
npm run pack:mac   # verpakte app (zip) in release/
npm run pack:win   # installer in release/, sinds B22
```

`npm test` draait de volledige suite van 460 tests over alle 27 testbestanden. Tot
2 augustus 2026 liep deze sandbox op Node 18 — te oud voor `jsdom` (ESM) en voor
`better-sqlite3` (segfault, ≥22 vereist) — waardoor `schema-dom.test.ts` en
`checkbox-widget.test.ts` hier niet laadden. Een `nvm`-install van Node 24 (naast het
systeem-Node, via een symlink in `~/.local/bin` vooraan het `PATH`) loste beide op. Wat
nog steeds ontbreekt: een beeldscherm, dus de app zelf opstarten en op scherm
verifiëren blijft alleen op de echte ontwikkelmachine mogelijk.

Twee handige haakjes:

```bash
npm run canonical -- test/corpus/24-vergadernotitie.md
```

De zelftest draait op de verpakte app, met vlaggen in plaats van omgevingsvariabelen —
`set` werkt alleen in cmd en PowerShell doet er stilzwijgend niets mee:

```bash
emqnote.exe --selftest=50 --vault=%TEMP%\emqnote-proef
```

De zelftest meet 50 keer hotkey → getekende cursor, typt daarna echt een notitie in het
venster en controleert dat er een correct bestand in de Inbox belandt. Hij eindigt met
een exitcode, dus hij kan zo in CI.

## Wat er nu moet gebeuren

**Klaar sinds de vorige versie van dit plan:** de vault-keuze bij eerste start — welke
OneDrive-tenant, van de twee zakelijke plus gedeelde bibliotheken op de Mac Mini — is
gebouwd; de app raadt niet en vraagt het. Zie B21 in 05-besluitenlog.md. Fase 5 is
sindsdien ook helemaal klaar — zie de tabel hierboven en `TODO.md` voor het volledige
verhaal.

1. **Uitzoeken of Power Automate beschikbaar is** in je werk-M365, voor het
   e-mail-vangnet in fase 6. Terugval staat klaar, dus dit blokkeert niets.
2. **Een echte serie metingen op Windows.** Drie regels uit het log is nog steeds te
   weinig om iets van te vinden — dat punt is niet opgelost sinds het voor het eerst is
   genoteerd. Draai de zelftest daar en lees `selftest-result.json`:

   ```
   set EMQNOTE_SELFTEST=50
   set EMQNOTE_VAULT=%TEMP%\emqnote-proef
   emqnote.exe
   ```

   Het resultaat komt in `%LOCALAPPDATA%\emqnote\`, samen met `latency.log`.
3. **Fase 4** — bewust uitgesteld. Zeven echte `.eml`-voorbeelden (2 augustus 2026)
   laten zien dat het platte `MsoListParagraph`-patroon uit
   [02-technisch-ontwerp.md](02-technisch-ontwerp.md#63-plak-pijplijn) niet voorkomt in
   Word-desktop-inhoud die al als echte `<ol>/<ul>/<li>` binnenkomt, noch in wat
   waarschijnlijk Outlook voor Mac blijkt te zijn (dezelfde webgebaseerde techniek als
   Outlook op het web). Alleen klassieke desktop Outlook op Windows kan dat nog
   bevestigen of ontkrachten, en die is twee weken niet beschikbaar vanaf 2 augustus
   2026. Details en het volledige onderzoek in `TODO.md`.

Voor het volledige, actuele overzicht van open punten (verificatie, housekeeping, wat er
sinds `v0.1.0` is gebouwd) zie `TODO.md` — dit document blijft bewust op het niveau van
de fasen, niet de losse taken.

## Wat expliciet géén onderdeel is

- Privénotities. Die blijven in Evernote.
- Agenda-koppeling met Outlook. Je vult onderwerp, locatie en aanwezigen zelf.
- Web clipper. Dat is een Evernote/privé-behoefte, niet deze.
- Samenwerking, delen, publiceren. Dit is één gebruiker op twee machines.
