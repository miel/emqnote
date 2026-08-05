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
| 4 Plakken en afbeeldingen | Nog niet begonnen — de volgende fase, en het grootste onbekende stuk werk |
| 5 Zoeken en synchronisatie | **Klaar.** SQLite/FTS5-index, volledige scan, `chokidar`-watcher, zoekbalk, conflictbanner met verschil en drie keuzes, opruimscherm voor verweesde bijlagen — alles bevestigd werkend via `Xvfb`, echte bestandsoperaties op schijf, niet alleen gerenderd |
| 6 E-mail | Nog niet begonnen |

Sinds `v0.1.0` landde ook, buiten dit fasenplan om, **B22**: een Windows-installer met
auto-updater (05-besluitenlog.md). Actuele versie: `v0.3.3`.

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
