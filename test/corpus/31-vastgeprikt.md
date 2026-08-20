---
title: Vastgeprikt bovenaan de lijst
type: quick
created: 2026-08-20T09:40:00+02:00
modified: 2026-08-20T09:40:00+02:00
tags: [klantx]
pinned: true
---

Deze notitie staat bovenaan de lijst, ongeacht de sorteervolgorde. Dat is één
regel in de frontmatter en verder niets: `pinned: true`, een echte boolean, dus
zonder aanhalingstekens.

Wat er níét in staat is net zo belangrijk. Een notitie die niet vastgeprikt is
krijgt geen `pinned: false` — het veld ontbreekt gewoon, zodat geen enkele
bestaande notitie er een regel bij krijgt.

- Vastprikken verandert `modified` niet: het is geen bewerking, en de lijst zou
  er anders juist door verspringen
- Maximaal drie tegelijk
- Het veld reist met het bestand mee naar de andere machine
