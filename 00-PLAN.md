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
| −1 Go/no-go | Ongetekende Electron-app start op de werkmachine |
| 0 Markdown-rondgang | Bytegelijk in beide richtingen, 25 corpusbestanden |
| 1 Residente schil | Tray, hotkey, voorgeladen venster, opslaan naar de Inbox |
| 2 Editor | ProseMirror, Outlook-sneltoetsen, outlines, kopblok |
| 3 Hoofdvenster | Mappenboom, notitielijst, lezen en bewerken, verplaatsen |
| 4 Plakken en afbeeldingen | Volgende |

Gemeten latency van de verpakte macOS-app mét editor: **p50 26 ms, p95 43 ms,
max 58 ms** over 30 rondes, tegen een budget van 80 ms. Op Windows ligt het hoger —
de eerste vertoning na het starten kostte daar 112 ms, daarna 77 en 52 ms.

```bash
npm test          # 178 tests
npm run typecheck
npm run dev       # draaien tijdens ontwikkelen
npm run pack:mac  # verpakte app in release/
```

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

1. **Kiezen op welke OneDrive de vault komt.** Op de Mac Mini staan twee zakelijke
   tenants — Futureproof Group en MKB Fonds — plus gedeelde bibliotheken. De app raadt
   niet en vraagt het bij de eerste start.
2. **Uitzoeken of Power Automate beschikbaar is** in je werk-M365, voor het
   e-mail-vangnet in fase 6. Terugval staat klaar, dus dit blokkeert niets.
3. **Een echte serie metingen op Windows.** Drie regels uit het log is te weinig om
   iets van te vinden. Draai de zelftest daar en lees `selftest-result.json`:

   ```
   set EMQNOTE_SELFTEST=50
   set EMQNOTE_VAULT=%TEMP%\emqnote-proef
   emqnote.exe
   ```

   Het resultaat komt in `%LOCALAPPDATA%\emqnote\`, samen met `latency.log`.
4. **Fase 3** — plakken uit Outlook op niveau, inclusief het reconstrueren van lijsten
   uit `mso-list`-metadata, en afbeeldingen naar de bijlagemap.

## Wat expliciet géén onderdeel is

- Privénotities. Die blijven in Evernote.
- Agenda-koppeling met Outlook. Je vult onderwerp, locatie en aanwezigen zelf.
- Web clipper. Dat is een Evernote/privé-behoefte, niet deze.
- Samenwerking, delen, publiceren. Dit is één gebruiker op twee machines.
