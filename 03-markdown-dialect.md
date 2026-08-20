# emqnote — het markdown-dialect

Dit document is een **specificatie**, geen toelichting. Het legt precies vast wat er in
een `.md`-bestand in de vault mag staan en hoe de serializer schrijft. Het is de
maatstaf voor de rondgang-testsuite uit fase 0.

Uitgangspunt: **CommonMark + GFM**, aangevuld met een klein aantal Obsidian-compatibele
uitbreidingen. Alles wat hier staat moet correct tonen in Obsidian, want dat is het
noodluik.

---

## 1. Bestandsvorm

| | |
|---|---|
| Tekencodering | UTF-8, zonder BOM |
| Regeleinden | `\n` (LF), ook op Windows |
| Slot | Precies één `\n` aan het eind van het bestand |
| Witruimte | Geen spaties aan het eind van een regel, behalve nooit |
| Blokscheiding | Precies één lege regel tussen blokken op hetzelfde niveau |

## 2. Frontmatter

Altijd aanwezig, altijd als eerste, YAML tussen `---`.

```yaml
---
title: Kickoff project Alpha
type: meeting
created: 2026-07-25T14:32:00+02:00
modified: 2026-07-25T15:10:00+02:00
location: Teams
attendees: [Jan de Vries, Els Bakker]
attachments: ["2026-07-25-1432-agenda.pdf"]
tags: [klantx, offerte]
source: manual
---
```

**Verplicht:** `title`, `type`, `created`
**Optioneel:** de rest

Regels:

- Veldvolgorde ligt vast, precies zoals hierboven. Niet alfabetisch, niet naar
  invoervolgorde — vast. Dat maakt diffs leesbaar en de rondgang deterministisch.
- Lege velden worden **weggelaten**, niet als `location:` of `location: ""` geschreven.
- `type`: `quick` of `meeting`
- `source`: `manual`, `email` of `import`
- Tijdstempels: ISO 8601 met tijdzone-offset. Nooit UTC-Z, want dan klopt het niet meer
  bij het teruglezen van een notitie uit de zomer in de winter.
- Lijsten inline (`[a, b]`) zolang ze op één regel passen onder 100 tekens, anders als
  blok met `- `.
- Aanhalingstekens (dubbel) worden gezet wanneer de waarde:
  - leeg is, of met witruimte begint of eindigt;
  - begint met een YAML-aanduidend teken (`-`, `?`, `:`, `,`, `[`, `]`, `{`, `}`, `#`,
    `&`, `*`, `!`, `|`, `>`, `'`, `"`, `%`, `@`, `` ` ``);
  - een dubbele punt **gevolgd door een spatie** bevat, of op een dubbele punt eindigt;
  - een spatie gevolgd door `#` bevat;
  - bij het teruglezen iets anders dan een string zou worden (`true`, `12`, `null`).

  Let op de derde regel: alleen `: ` breekt YAML, een kale dubbele punt niet. Daardoor
  blijft `created: 2026-07-25T14:32:00+02:00` onaangehaald, terwijl
  `title: "Stuurgroep: kwartaalrapportage"` wél aanhalingstekens krijgt.

- In een inline-array krijgt een waarde ook aanhalingstekens als er een komma of een
  haakje in zit.

## 3. Blokken

### 3.1 Koppen

ATX, altijd. Nooit setext (`====`). Niveau 1 tot en met 6.

```markdown
## Besluiten
```

De titel van de notitie staat in de frontmatter, niet als `#` bovenaan. Een `#` in de
tekst is dus een echte kop binnen de notitie — met één uitzondering: een `#` met
onmiddellijk een woord erachter is een tag, geen kop. Zie §3.8. CommonMark leest een
kop alleen wanneer er een spatie, een tab of het regeleinde op de hekjes volgt, dus de
twee kunnen elkaar niet in de weg zitten.

### 3.2 Alinea's

Platte tekst. Een enkele `\n` binnen een alinea bestaat niet — een alinea is één regel,
hoe lang ook. Geen regelafbreking op 80 tekens; dat maakt diffs onleesbaar zodra je één
woord toevoegt.

### 3.3 Zachte regelovergang

`Shift+Enter` in de editor wordt een **backslash aan het regeleinde** (CommonMark):

```markdown
Aanwezig namens ons:\
Jan, Els en Ruben
```

Bij het **lezen** worden ook `<br>` en twee spaties aan het regeleinde geaccepteerd —
die komen uit Obsidian of uit geplakte HTML. Bij het **schrijven** altijd de backslash.

### 3.4 Lijsten — het belangrijkste onderdeel

**Markers:** `-` voor opsommingen (nooit `*` of `+`). `1.` `2.` `3.` voor nummering,
met de werkelijke doorlopende nummers, niet overal `1.`.

**Inspringing is de inhoudskolom van het bovenliggende item.** Dus:

- na `- ` → 2 spaties
- na `1. ` → 3 spaties
- na `10. ` → 4 spaties

Dit is CommonMark-conform en toont correct in Obsidian. Vaste inspringing van 2 of 4
spaties is dat níét zodra je een genummerde lijst nest.

**Gemengde niveaus:**

```markdown
1. Voorbereiding
   - Offerte nalezen
   - Deelnemerslijst controleren
     1. Ruben ontbreekt nog
     2. Els heeft afgezegd
2. Uitvoering
```

**Alinea's onder een bullet** — de vorm waar Obsidian op stukliep. Een lege regel,
daarna de alinea op de inhoudskolom:

```markdown
- Budget is akkoord

  Bevestigd door Els in de stuurgroep van 12 juni. De formele goedkeuring komt
  via de gebruikelijke route.

  Aandachtspunt: het bedrag is exclusief de meerwerkpost.

- Planning nog niet
```

**Takenlijsten** (GFM):

```markdown
- [ ] Offerte versturen
- [x] Agenda rondsturen
```

**Een leeg vakje** is één afwijking van GFM, en een bewuste:

```markdown
- [ ]
```

GFM eist dat er ná het vakje een spatie én inhoud staat; `- [ ]` op zichzelf is daar een
gewone bullet met de tekst `[ ]`. Dat is precies de halfgeschreven checklist — een vakje
dat er staat te wachten tot je erin typt — en het viel bij elke opslag om tot een kale
bullet. Het wordt daarom geschreven **zonder sluitspatie** (§2 verbiedt witruimte aan het
regeleinde) en bij het lezen weer als taak herkend. Obsidian leest hem net zo, dus een
lijst die hier begint en daar verdergaat overleeft de reis.

Letterlijke vierkante haken blijven ontsnapt — `- \[ ]` is een bullet met de tekst `[ ]`,
geen leeg vakje — en dát onderscheid wordt aan de brontekst gemeten, niet aan de
geparste tekst, want die twee zijn identiek.

**Een ster als aanduiding** is de tweede afwijking, en van dezelfde soort (B72):

```markdown
- ⭐ Offerte nalezen voordat hij de deur uit gaat
- Deelnemerslijst controleren
- ⭐
```

Voor markdown is dit een gewone bullet waarvan de tekst met een ster begint, en zo toont
Obsidian hem ook: `• ⭐ Offerte nalezen`. In emqnote staat de ster wáár de bullet stond en
is hij geen tekst — hij is een eigenschap van het item, precies zoals het vakje dat is.
Daarmee gedraagt zo'n regel zich verder in alles als een gewone bullet: Backspace,
Home, alles selecteren, kopiëren, het uittreksel en de takenlijst zien de ster niet.

De regel is eng: **de ster, gevolgd door één spatie, aan het begin van het item**. `⭐ster`
is een woord dat met een ster begint en blijft tekst. Een leeg item — `⭐` alleen — is het
tegenhanger van `- [ ]` en wordt net zo geschreven, zonder sluitspatie.

Twee plaatsen waar de ster gewone tekst blijft, en om dezelfde reden: de aanduiding is daar
al bezet. Bij een taak door het vakje, bij een genummerd item door het nummer.

```markdown
- [ ] ⭐ Hier is de ster gewone tekst
1. ⭐ En hier ook
```

De prijs staat in `test/limitations.test.ts`: een bullet die écht met een ster en een spatie
wil beginnen, kan niet. Er is geen ontsnapte vorm — `⭐` is geen leesteken, dus niets
ontsnapt hem en er is geen brontekst-onderscheid te maken zoals bij `\[ ]`. De bytes op
schijf blijven in beide lezingen dezelfde; alleen betekent de ster dan aanduiding in plaats
van woord.

**Losse tegenover strakke lijsten.** CommonMark kent losheid alleen als eigenschap van
de bróntekst, en ProseMirror bewaart die niet. De serializer moet hem dus afleiden, en
die afleiding ís de norm:

> Een lijstitem is **los** zodra het ná de eerste alinea nog iets anders bevat dan een
> geneste lijst. Is één item in een lijst los, dan is de hele lijst los.

Een los item krijgt lege regels tussen zijn eigen blokken; een losse lijst krijgt lege
regels tussen álle items, ook de korte. Daarmee blijft de gewone outline-vorm — een
bullet met een sublijst eronder — strak:

```markdown
- Bevinding
  - Detail
  - Nog een detail
- Volgende bevinding
```

terwijl een tweede alinea, tabel of codeblok wél lege regels krijgt, wat markdown daar
ook echt nodig heeft om niet als voortzetting van de vorige regel te worden gelezen.

### 3.5 Tabellen

GFM-tabellen. Kolommen worden **niet** uitgelijnd met opvulspaties — dat geeft enorme
diffs bij één gewijzigde cel.

```markdown
| Onderwerp | Eigenaar | Datum |
| --- | --- | --- |
| Offerte | Jan | 2026-08-01 |
```

De scheidingsrij is altijd minstens drie streepjes (`---`), niet het minimaal
toegestane enkele streepje. Dat is wat Obsidian en zowat elk ander gereedschap
schrijft; met één streepje zou een bezoek aan Obsidian elke tabel in de vault
herschrijven.

Uitlijning per kolom via `:---`, `:---:`, `---:` wanneer die is ingesteld.

Een zachte regelovergang bestaat in een GFM-cel niet; die wordt daar `<br>`.

**Samengevoegde cellen kan GFM niet uitdrukken.** Zo'n tabel — die komt voor bij plakken
uit Outlook — blijft een HTML-`<table>` in het bestand. Obsidian toont die correct.

### 3.6 Codeblokken

Altijd afgebakend met backticks, nooit met inspringing (die botst met lijsten).
Taalaanduiding als bekend. De afbakening is drie backticks, of langer wanneer de inhoud
zelf drie backticks bevat.

Inline-code krijgt precies zoveel backticks als nodig, en géén opvulspaties tenzij de
inhoud zelf met een backtick begint of eindigt: `` ``tekst met een ` erin`` ``.

### 3.7 Citaten en scheidingslijn

```markdown
> Citaat uit de mail van Jan.
```

Scheidingslijn: `---` op een eigen regel, met een lege regel ervoor en erna. Nooit `***`
of `___`.

### 3.8 Tags

Een tag is een `#` met onmiddellijk een naam erachter, ergens in de tekst:

```markdown
#klantx staat vooraan, en halverwege de regel staat #offerte ook.
```

Tags staan op twee plaatsen en die zijn niet hetzelfde:

- **In de frontmatter**, in het veld `tags:` (§2). Dat is wat in het tagveld van het
  capture-venster is getypt.
- **In de tekst**, als `#naam`. Die blijven staan waar ze staan.

De app voegt de twee samen bij het filteren, maar schrijft ze nooit naar elkaar over. Een
`#tag` in de tekst belandt dus níét in de frontmatter — anders zou het wijzigen van één
zin de frontmatter herschrijven, en dat is precies wat B10 verbiedt.

**Grammatica**, gelijk aan die van Obsidian:

| | |
|---|---|
| Opent | aan het begin van een regel, of na witruimte, `(` of `[` |
| Naam | letters, cijfers, `_`, `-`, `/` |
| Eindigt | bij het eerste teken dat daar niet in zit |
| Niet | een naam die alleen uit cijfers bestaat (`#2026`, `#1`) |
| Niet | in code, in een URL-fragment, of in `[[Notitie#Kop]]` |

`#klant/offerte` is één naam. De schuine streep is toegestaan maar betekent niets voor
het filteren — anders dan in Obsidian, waar hij een hiërarchie aanduidt.

Hoofdletters blijven staan zoals ze zijn getypt; voor het groeperen worden ze genegeerd,
net als bij deelnemersnamen.

**De uitzondering op het ontsnappen.** Aan het begin van een regel wordt een `#` normaal
ontsnapt tot `\#`, want daar zou hij een kop kunnen beginnen (§6). Voor een tag gebeurt
dat niet: `\#klantx` is voor Obsidian geen tag, en dan zou de helft van de tags in de
vault stilzwijgend dood zijn — precies wat B7 moet voorkomen. Het kan geen kwaad, want
CommonMark leest alleen een kop wanneer er een spatie, tab of regeleinde op de hekjes
volgt. `\# Dit is geen kop` houdt zijn backslash dus wél. Zie B19.

## 4. Inline-opmaak

| Wat | Schrijfwijze | Ook geaccepteerd bij lezen |
|---|---|---|
| Vet | `**tekst**` | `__tekst__`, `<b>`, `<strong>` |
| Cursief | `*tekst*` | `_tekst_`, `<i>`, `<em>` |
| **Onderstreept** | `<u>tekst</u>` | — |
| **Markeren** | `==tekst==` | `<mark>tekst</mark>` |
| Doorhalen | `~~tekst~~` | `<s>`, `<del>` |
| Code | `` `tekst` `` | — |
| Link | `[tekst](https://…)` | `<https://…>`, kale URL |

Onderstrepen en markeren zijn de reden dat dit dialect inline HTML respectievelijk een
Obsidian-uitbreiding toestaat: **markdown kent ze niet**, en ze zitten wel in het
dagelijkse gebruik uit Outlook. Tekstkleur wordt bewust *niet* ondersteund — dat is
presentatie, niet betekenis, en het maakt bestanden onleesbaar.

**Nestvolgorde.** ProseMirror kent opmaak als een ongeordende verzameling per teken;
markdown is een boom. Bij het schrijven wordt daarom altijd dezelfde volgorde
aangehouden, van buiten naar binnen:

> link → markeren → onderstrepen → vet → cursief → doorhalen → code

Dus `==<u>**tekst**</u>==`, nooit `**<u>==tekst==</u>**`. Zonder een vaste volgorde zou
hetzelfde document twee verschillende bestanden kunnen opleveren en is de rondgang niet
bytegelijk.

**Markeren en flankering.** Een openend `==` mag niet door witruimte worden gevolgd, een
sluitend `==` niet door witruimte worden voorafgegaan. Daardoor blijft `als a == b`
gewone tekst.

## 5. Verwijzingen

### 5.1 Bijlagen

```markdown
![[2026-07-25-1432-schermafbeelding.png]]
```

Alleen de bestandsnaam, **geen pad**. Obsidian lost wikilinks vault-breed op naam op,
dus een notitie verplaatsen breekt de verwijzing niet. De tijdstempel-prefix garandeert
dat namen uniek zijn.

Niet-afbeeldingen als gewone wikilink:

```markdown
[[2026-07-25-1432-offerte.pdf]]
```

**Het gleufje achter de streep van een `![[…]]`** (B74). Obsidian leest dat ene gleufje op
drie manieren, door te kijken wát erin staat, en dit dialect doet precies hetzelfde — B7: de
vault blijft leesbaar in Obsidian, en Obsidian doet dit al.

| In het bestand | Betekent |
|---|---|
| `\|250` | een breedte in pixels; de hoogte volgt de afbeelding |
| `\|250x180` | een breedte én hoogte in pixels |
| iets anders | alt-tekst |

```markdown
![[2026-07-25-1432-schermafbeelding.png|400]]
![[2026-07-25-1432-plattegrond.png|250x180]]
![[2026-07-25-1432-schermafbeelding.png|een foto van het kantoor]]
```

Bij een externe afbeelding staat datzelfde achtervoegsel achter de alt-tekst, opnieuw zoals
Obsidian het schrijft. Daar bestaat het "alles is alt-tekst"-geval niet: de alt-tekst is de
*kop*, dus alleen een staart die als formaat leest wordt eraf gehaald, en
`![Voor|na](…)` is gewoon een alt-tekst met een streep erin.

```markdown
![Het logo|320](https://voorbeeld.nl/logo.png)
![Het logo|250x180](https://voorbeeld.nl/logo.png)
```

**Er gaat niets in dat gleufje verloren.** Een breedte en een hoogte worden getekend;
alt-tekst wordt bewaard en — voorlopig met opzet — nergens getoond: niet op de `<img>`, niet
in het uittreksel, niet in de index. Dat is het verschil met hoe het tot B74 was, en het was
een echt verlies: vanaf de allereerste markdown-commit werd *alles* achter de streep van een
`![[…]]` weggegooid, dus een in Obsidian geschreven notitie verloor zijn alt-tekst zodra er
in deze app iets in die notitie werd gewijzigd. Iets niet begrijpen is nooit een reden om het
niet te bewaren.

Wat níét als formaat leest blijft daarom letterlijk staan: een getal buiten de grenzen zoals
`|4`, een leeg gleufje `![[foto.png|]]` dat er wél is, en `250X180` met een hoofdletter — dat
laatste **in Obsidian nagekeken: daar verandert een hoofdletter-`X` de grootte ook niet**, dus
beide apps tonen hetzelfde en dit is overeenstemming en geen afwijking. Hem letterlijk bewaren
in plaats van hem naar `250x180` recht te trekken is dan gratis, en scheelt een teken dat
niemand deze app gevraagd heeft aan te raken. Andersom is `![Grafiek|2024](…)` wél een breedte,
omdat er geen ontsnapte vorm bestaat om de twee uit elkaar te houden; diezelfde afweging staat
bij de ster in §3.

**Eén gleufje betekent één ding tegelijk.** Een afbeelding kan dus geen formaat én alt-tekst
dragen: dat is de grens van het formaat, niet een keuze hier, en het is de reden dat een
afbeelding die je versleept zijn alt-tekst kwijtraakt. `test/limitations.test.ts` legt het vast.

**Deze app schrijft zelf nooit een hoogte.** De handvatten houden de verhoudingen vast, dus wat
zij opleveren is `|400`, één getal: een hoogte die deze app zelf verzint zou een tweede bron van
waarheid zijn die niet meer klopt zodra het bestand erachter wordt vervangen. Een hoogte die
iemand ánders schreef is iets heel anders en wordt wél getekend en bewaard — en een sleep op zo'n
afbeelding schaalt beide getallen met dezelfde factor, want iemands afbeelding rechttrekken omdat
hij toevallig een hoekje beetpakte is iets besluiten wat deze app niet kan weten.

`src/markdown/embed-field.ts` is de enige plek waar dit gleufje wordt gespeld, in beide
richtingen en voor beide vormen — twee spellingen van één syntax is hoe een plakactie en een
heropening het over dezelfde tekens oneens worden.

### 5.2 Notities onderling

```markdown
[[2026-07-25 1432 Kickoff project Alpha]]
```

Met alias:

```markdown
[[2026-07-25 1432 Kickoff project Alpha|de kickoff]]
```

### 5.3 Externe links

Altijd de vorm `[tekst](url)`, ook voor e-mailadressen en ook waar markdown de kortere
`<url>` toestaat. Eén vorm voor elke link is voorspelbaarder dan een mengeling, en het
is wat een WYSIWYG-editor sowieso produceert:

```markdown
[jan.devries@example.com](mailto:jan.devries@example.com)
```

## 6. Ontsnappen

De serializer ontsnapt met een backslash, en alleen waar het echt nodig is:

- Aan het begin van een regel: `#`, `>`, `-`, `+`, `1.` (bij een cijfer gevolgd door
  punt en spatie), `|` — met één uitzondering: een `#` die een tag opent blijft staan
  (§3.8). `\#klantx` is voor Obsidian geen tag, en dat zou de helft van de tags in de
  vault stilzwijgend dood maken.
- In de tekst: `*`, `_`, `` ` ``, `[`, `]`, `<`, `~~` — maar alleen wanneer de reeks
  anders als opmaak zou worden gelezen. Een losse `*` midden in een woord wordt niet
  ontsnapt; dat geeft alleen maar ruis in het bestand.
- Een backslash in de tekst wordt zelf ontsnapt zodra er een leesteken op volgt
  (`pad\*naam` wordt `pad\\\*naam`), maar niet voor een letter (`pad\naar` blijft
  staan) — daar kan hij geen kwaad.
- In tabelcellen: `|` wordt `\|`

## 7. Wat níét is toegestaan

| | Waarom |
|---|---|
| Setext-koppen (`====` onder de tekst) | Twee manieren voor hetzelfde |
| Ingesprongen codeblokken | Botsen met lijstinspringing |
| Referentiestijl-links (`[a][1]`) | Rondgang wordt onstabiel |
| Tekstkleur, lettertype, lettergrootte | Presentatie, geen betekenis |
| HTML behalve `<u>`, `<br>`, `<mark>`, `<table>`-familie | Houdt bestanden leesbaar |
| Harde regelafbreking op kolombreedte | Onleesbare diffs |
| Volgnummers `1.` voor elk item | Onleesbaar als je het bestand rauw bekijkt |
| Een kop als eerste inhoud van een lijstitem (`1. # Titel`) | Overleeft de rondgang niet: `listItem` is `paragraph block*`, dus er komt een lege alinea vóór, en bij het teruglezen ontsnapt de kop uit de lijst (B62) |
| Genummerde koppen (`1.` / `1.1` / `1.1.1` vóór een kop) | GFM kent ze niet; zie B62 voor waarom ze ook niet verzonnen worden |

Een kop *onder* de eerste regel van een lijstitem mag wel, en komt byte-identiek terug:

```markdown
1. Titel

   ## Subtitel
```

## 8. De rondgang-eis

Dit is de bindende regel van fase 0 en van elke wijziging daarna:

> Voor elk bestand in het testcorpus geldt:
> **lezen → ProseMirror-document → schrijven** levert **byte-identiek** hetzelfde
> bestand op.

En omgekeerd:

> **Document → schrijven → lezen** levert een document op dat structureel gelijk is aan
> het origineel.

Het testcorpus bevat minstens deze gevallen, elk als eigen bestand:

1. Alleen frontmatter, lege body
2. Alle inline-opmaak in één alinea, inclusief geneste combinaties
3. Onderstreept en gemarkeerd door elkaar met vet en cursief
4. Opsomming, zes niveaus diep
5. Genummerde lijst, zes niveaus diep
6. Gemengde bullets en nummering, wisselend per niveau
7. Nummering die doorloopt boven de 9 (inspringing wordt dan 4 spaties)
8. Alinea's onder een bullet, meerdere per item
9. Een tabel binnen een lijstitem
10. Een afbeelding binnen een geneste lijst
11. Losse tegenover strakke lijst
12. Takenlijst met gemengde status
13. GFM-tabel met alle uitlijningen
14. HTML-tabel met samengevoegde cellen
15. Codeblok met backticks in de inhoud
16. Citaat met een lijst erin
17. Zachte regelovergangen in een alinea en in een lijstitem
18. Tekens die ontsnapt moeten worden, in alle posities, inclusief backslashes
19. Nederlandse diakritieken, emoji, en tekens buiten de BMP
20. Zeer lange alinea zonder regelafbreking
21. Wikilinks, ingesloten bijlagen, aliassen, externe links
22. Een notitie met alle frontmatter-velden gevuld
23. Een notitie met alleen de verplichte velden
24. Realistische vergadernotitie, ~2 A4, zoals hij ze werkelijk schrijft
25. Realistische geplakte Outlook-mail, na conversie
26. Tags in de frontmatter en in de tekst, in alle posities waar een `#` anders zou
    worden ontsnapt (§3.8)

Punt 24 en 25 zijn geen randgevallen maar het dagelijks gebruik. Als die twee niet
byte-stabiel zijn, is de rest academisch.

Het corpus staat in `test/corpus/`. Elk bestand is met de hand geschreven en ís de
specificatie: wijkt de uitvoer af, dan is er één van beide fout, en dat onderscheid is
een besluit — geen reden om de test te versoepelen.

```bash
npm test
```

Om te zien hoe de serializer een bestand zou schrijven, met de afwijkingen erbij:

```bash
npm run canonical -- test/corpus/24-vergadernotitie.md
```

## 9. Bekende beperkingen

Deze gevallen ronden niet af zoals een argeloze lezer zou verwachten. Ze zijn bewust
geaccepteerd en staan vastgelegd in `test/limitations.test.ts`, zodat ze zichtbaar
blijven in plaats van te sluimeren.

| Geschreven | Wordt | Waarom |
|---|---|---|
| `\[\[geen wikilink]]` | een wikilink | De ontsnapping is bij het parsen al verdwenen; de scanner ziet geen verschil meer met een echte verwijzing |
| `\=\=geen markering\=\=` | een markering | Zelfde oorzaak |
| `\#klantx` aan het begin van een regel | een echte tag | Zelfde oorzaak. Niemand schrijft met de hand een backslash vóór een woord, en de uitzondering uit §3.8 is er alleen wanneer er direct een naam op volgt |

Beide oplossen vraagt om positiebewust parseren — terugkijken in de brontekst om te zien
of een teken ontsnapt was. Dat is een aanzienlijke complicatie voor gevallen die in
werknotities vrijwel niet voorkomen. De flankeringsregel voor `==` vangt bovendien de
enige variant die in de praktijk wél voorkomt: `als a == b` blijft gewoon tekst.
