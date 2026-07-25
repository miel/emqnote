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

**Fase 0 is af.** Parser, serializer en het testcorpus van 25 bestanden staan er; de
rondgang is bytegelijk in beide richtingen.

```bash
npm test
```

Code in `src/markdown/`, corpus in `test/corpus/`, bekende beperkingen vastgelegd in
`test/beperkingen.test.ts`. Om te zien hoe de serializer een bestand zou schrijven:

```bash
npm run canonical -- test/corpus/24-vergadernotitie.md
```

## Wat er nu moet gebeuren

1. **Go/no-go-test op de werkmachine** — zie [04-bouwplan.md](04-bouwplan.md#fase--1--go-no-go).
   Kun je een ongetekende, portable Electron-app starten? AppLocker of WDAC kan dat
   blokkeren, ook zónder installatie. Dit weten kost tien minuten en verandert
   desnoods de hele aanpak. **Dit blokkeert fase 1.**
2. **Uitzoeken of Power Automate beschikbaar is** in je werk-M365 (voor het
   e-mail-vangnet). Terugval staat klaar, dus dit blokkeert niets.
3. **Fase 1** — de residente Electron-schil: tray, global hotkey, voorgeladen verborgen
   capture-venster, opslaan naar de Inbox. Kan pas na punt 1.

## Wat expliciet géén onderdeel is

- Privénotities. Die blijven in Evernote.
- Agenda-koppeling met Outlook. Je vult onderwerp, locatie en aanwezigen zelf.
- Web clipper. Dat is een Evernote/privé-behoefte, niet deze.
- Samenwerking, delen, publiceren. Dit is één gebruiker op twee machines.
