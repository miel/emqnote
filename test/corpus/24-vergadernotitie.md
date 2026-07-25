---
title: Stuurgroep Alpha - besluitvorming fase 2
type: meeting
created: 2026-07-25T11:10:00+02:00
modified: 2026-07-25T13:05:00+02:00
location: Teams
attendees: [Jan de Vries, Els Bakker, Ruben Ockhuizen, Sanne Wijngaarden, Peter Klaassen]
attachments: [2026-07-25-1110-fase2-scope.pdf]
tags: [stuurgroep, alpha]
source: manual
---

## Doel van dit overleg

Besluit over de scope van fase 2 en over de vraag of we de testomgeving zelf inrichten of afnemen bij de leverancier. Els zit voor, Sanne notuleert normaal maar is later.

## Terugblik fase 1

1. Opgeleverd binnen de planning
   - Migratie van de eerste twee datasets is afgerond
   - De acceptatietest is doorlopen met **twee openstaande bevindingen**
     1. Rapportagemodule rekent verkeerd bij een gebroken boekjaar
     2. Export naar Excel verliest de opmaak van de kopregel
   - Beide bevindingen staan gepland voor de eerste sprint van fase 2

2. Budget

   - Uitgeput tot 94 procent, dus binnen de marge

   Peter merkt op dat de resterende 6 procent al is toegezegd aan het meerwerk voor de koppeling. Dat is nog niet formeel vastgelegd.

3. Wat niet goed ging
   - De doorlooptijd van de acceptatie was drie weken in plaats van één

     De oorzaak was dat de testers pas konden beginnen toen de omgeving stond, en die stond twee weken later dan afgesproken. Dat is precies het punt dat vandaag terugkomt bij de testomgeving.

## Scope fase 2

Voorstel van Jan, met de reacties erbij:

| Onderdeel | Voorstel | Reactie |
| --- | --- | --- |
| Koppeling met het bronsysteem | Wel | Akkoord, met de kanttekening van Peter |
| Rapportagemodule uitbreiden | Wel | Els wil eerst de bevinding opgelost zien |
| Mobiele weergave | Niet | Akkoord, doorschuiven naar fase 3 |
| Tweede migratieslag | Wel | Ruben twijfelt over de capaciteit |

Ruben licht toe:

> Ik heb twee mensen beschikbaar tot half oktober. Als de tweede migratieslag erbij komt, red ik dat alleen als de koppeling een sprint opschuift. Anders moet er iemand bij, en die is er niet.

Els vraagt of dat betekent dat het <u>niet</u> haalbaar is, of dat het ==met een sprint schuiven== wél kan. Ruben: het tweede.

## Besluit testomgeving

- Zelf inrichten
  - Voordeel: geen afhankelijkheid van de leverancier, dus niet nog eens twee weken wachten
  - Nadeel: kost ons ongeveer 8 dagen aan eigen capaciteit
- Afnemen bij de leverancier
  - Voordeel: geen eigen capaciteit nodig
  - Nadeel: doorlooptijd onzeker, en dat is precies waar fase 1 op stukliep

**Besluit: zelf inrichten.** Els neemt het mee naar de opdrachtgever ter bekrachtiging.

## Acties

- [ ] Jan: scope fase 2 aanpassen conform bovenstaande tabel, koppeling een sprint later
- [ ] Ruben: capaciteitsplanning bijwerken en delen voor 1 augustus
- [x] Els: agenderen bij de opdrachtgever
- [ ] Peter: meerwerk koppeling formeel vastleggen
- [ ] Ikzelf: navragen of de licentie voor de testomgeving al loopt

## Losse aantekeningen

Peter noemde terloops dat er vanuit inkoop wordt gekeken naar een raamcontract met dezelfde leverancier. Als dat er komt, verandert de businesscase voor fase 3 behoorlijk. Navragen bij inkoop, maar niet in dit overleg.\
Sanne kwam om 11.40 binnen, dus de eerste twee agendapunten heeft zij niet meegekregen.

Volgende overleg: 12 augustus, zelfde tijd.
