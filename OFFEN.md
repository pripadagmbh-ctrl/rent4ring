# OFFEN.md — unterwegs aufgefallen, bewusst NICHT umgesetzt

Sammelstelle für Dinge, die bei der Umsetzung der REVIEW.md-Befunde auffielen,
aber **nicht** in REVIEW.md stehen. Laut Auftrag hier notiert statt umgesetzt.

---

## O1 — `npx tsc --noEmit` schlug im Ausgangszustand fehl (behoben)

```
vite.config.ts(10,9): error TS2591: Cannot find name 'process'.
```

`vite.config.ts:10` liest `process.env.GITHUB_PAGES`, aber `@types/node` ist nicht
installiert und `tsconfig.json` listet `node` nicht unter `types`.

**Stand:** Vorbestehend — der Fehler war vor der ersten Änderung da und ist bei
jedem Zwischencheck der einzige gemeldete Fehler geblieben (diente als Baseline).

**Warum nicht umgesetzt:** Kein Befund in REVIEW.md, und die Behebung bräuchte eine
neue Abhängigkeit (`@types/node`) — laut Auftrag vorher abzustimmen.

**Relevanz:** **Blockiert M17.** M17 will `tsc --noEmit && vite build` als Build-Skript;
solange dieser Fehler steht, würde das den Build sofort rot machen. O1 muss also
vor oder zusammen mit M17 geklärt werden.

**Behoben** über Variante (a): `@types/node` steht als devDependency in
`package.json`, `npx tsc --noEmit` läuft grün, und M17 (`tsc --noEmit` vor
`vite build`) ist damit freigegeben und umgesetzt.

---

## O2 — `package-lock.json` trug einen veralteten Projektnamen (behoben)

Das Lockfile nennt das Projekt an zwei Stellen `rent4ring`, `package.json` dagegen
`rent4ring-home-circuit`; zusätzlich steht im Lockfile ein `"license": "ISC"`, das
`package.json` nicht führt. Ein `npm install` korrigiert beides automatisch und
erzeugt dadurch einen Diff, der mit keiner inhaltlichen Änderung zu tun hat.

**Behoben:** Das Lockfile nennt das Projekt an beiden Stellen
`rent4ring-home-circuit`, die fremde `"license": "ISC"`-Zeile ist weg. Nachgezogen
in `da44de6`.

---

## O3 — M15 ist ohne messbare Wirkung geblieben (dokumentiert, nicht offen)

Der dynamische Bremshorizont (M15) hat die Lap-Times aller sieben Autos **exakt
unverändert** gelassen. Grund: Mit den realen Grip-Werten der Flotte (1,05–1,38)
liegt die Grenz-Bremsdistanz nur knapp über den alten fixen 260 m und bindet auf
dieser Strecke praktisch nie. Der Befund ist trotzdem behoben (die systematische
Schwäche für hypothetisch schnellere Autos ist weg), aber es gibt kein
Vorher/Nachher-Delta als Nachweis — hier nur festgehalten, damit das später nicht
als „Fix hat nicht gewirkt" missverstanden wird.

---

## O4 — Wendehammer und Verbindungsfahrbahn überlappten die Burgstraße (behoben)

Beim Eindrehen des Areals (TWIST in `src/game/departure.ts`) vermessen: Das
Grundstück liegt in einer Haarnadel, die Straße läuft auf der einen Seite hinaus
und auf der anderen wieder zurück. Der Wendehammer (`PLATEAU`) und die
Verbindungsfahrbahn (`LINK`) reichten bis auf **1,27 m** an die Mittellinie des
zurücklaufenden Astes heran — bei einer halben Fahrbahnbreite von 3,1 m liegt
das Teer also mitten auf der Straße. Die Drehung um +0,03 rad hat den Abstand
auf **2,13 m** verbessert, aber nicht behoben; mehr ging nicht, weil die
straßenseitige Hallenwand nur 4,10 m von der Mittellinie des hinausführenden
Astes entfernt steht und ab etwa 2° selbst in die Fahrbahn wandert.

**Behoben** durch den neuen Zuschnitt: `PLATEAU.maxZ` von 24 auf 23, und `LINK`
in zwei Teile zerlegt — die Einmündung behält ihre breite Mündung
(x −9,5…6, z bis 25), der östliche Teil `LINK_EAST` (x 6…20) endet bei z 23.
Eine einzelne Rechteckfläche hätte auf den schlechtesten Fall zugeschnitten
werden müssen und dabei die Mündung mit weggenommen.

Gemessen gegen die Fahrbahnmitte, Fahrbahnrand bei 3,1 m:

| Fläche | vorher | nachher | Bankett |
|---|---|---|---|
| PLATEAU | 2,99 m | 3,99 m | 0,89 m |
| LINK (Mündung) | — | 4,17 m | 1,07 m |
| LINK_EAST | 2,13 m | 4,62 m | 1,52 m |

Fahrlinie geprüft: alle vier Fahrzeugecken liegen an 69 Stützpunkten der
Ausfahrt auf Teer (Hofflächen oder Burgstraße), die Kehre eingeschlossen.

---

## O5 — Zielrundenzeiten lassen sich nicht seriös nachziehen, solange der Auto-Fahrer nicht sauber fährt

Nach dem Lenkungs-Fix schlägt der Auto-Fahrer aus `simulate.ts` die
Zielrundenzeiten um 39 bis 100 Sekunden — was zunächst wie zu leicht gesetzte
Ziele aussieht. Der Wert taugt aber nicht als Maßstab: derselbe Lauf meldet
**20 bis 53 Prozent Zeit abseits der Strecke** und **111 bis 348
Leitplankenkontakte** pro Runde, `latMax` liegt bei allen acht Fahrzeugen exakt
auf 12,5 m — das ist die Barriere (`halfWidth + 6,5`). Der Follower fährt also
keine Runde, er prallt eine Runde lang die Leitplanken entlang und schneidet
dabei ab. Seine Zeiten sind zu schnell, weil er schummelt, nicht weil die Ziele
zu weich sind.

**Versucht und verworfen:** Recentre-Verstärkung von 0,14 auf 0,5, Eingriff ab
55 statt 85 Prozent der halben Fahrbahnbreite, Apex-Offset zurückgenommen,
Kurventempo-Sicherheitsfaktor von 0,94 auf 0,86. Ergebnis war deutlich
schlechter — der P-Anteil kämpft gegen die Ideallinie, die Kontakte stiegen bei
den schnellen Autos (GT3 RS 159 → 304), und die Ducati kam gar nicht mehr
durch (DNF). Rückgängig gemacht.

**Was es wirklich bräuchte:** eine vorab berechnete Ideallinie mit daraus
abgeleitetem Geschwindigkeitsprofil statt eines Apex-Offsets pro Frame. Das ist
ein eigenes Stück Arbeit am Werkzeug, kein Tuning-Wert.

**Relevanz:** Blockiert jede belastbare Aussage über den Schwierigkeitsgrad.
Die Zielzeiten stehen bewusst unverändert — sie auf Basis dieser Messung
nachzuziehen wäre geraten, nicht gemessen.
