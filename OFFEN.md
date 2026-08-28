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

## O5 — Zielrundenzeiten (Werkzeug behoben, Ducati offen)

**Behoben:** Der Auto-Fahrer in `simulate.ts` fuhr keine Runde, er prallte eine
Runde lang die Leitplanken entlang — 20 bis 53 Prozent neben der Strecke, 111
bis 348 Kontakte. Seine Zeiten waren zu schnell, weil er abkürzte, nicht weil
die Ziele zu weich waren.

Er hat jetzt eine vorab berechnete Ideallinie (`scripts/racingLine.ts`):
Minimum-Krümmung durch Relaxation über die Fahrbahnbreite, dann ein
Geschwindigkeitsprofil aus der Krümmung *dieser Linie* mit Rückwärts- und
Vorwärtsdurchlauf. Der Follower folgt der Linie, statt sie pro Frame zu
erfinden; der Rückstell-Term gegen die Mittellinie ist weg, weil er gegen die
Linie kämpfte.

| Fahrzeug | Kontakte vorher → nachher | off vorher → nachher |
|---|---|---|
| MINI Cooper S | 111 → **0** | 20,3 % → **0,7 %** |
| GR Yaris | 140 → **0** | 27,7 % → **1,8 %** |
| GR Supra | 126 → **0** | 24,5 % → **1,7 %** |
| Taycan Turbo GT | 300 → 34 | 41,5 % → 7,1 % |
| 718 Spyder RS | 206 → 5 | 34,4 % → 7,7 % |
| 911 GT3 RS | 159 → 15 | 30,5 % → 10,6 % |
| Ferrari 296 GTB | 166 → 8 | 37,5 % → 10,5 % |

Ein Rechenfehler war dabei der Kern: die Menger-Krümmung ist `4A/(abc)`, das
Kreuzprodukt liefert aber `2A`. Mit dem falschen Faktor war jede Krümmung
halbiert, jeder Radius verdoppelt und das Profil 41 Prozent zu schnell — die
langsamste Stelle der ganzen Nordschleife kam mit 75 km/h heraus, und
Wehrseifen ist eine 40er-Kurve. Korrigiert liegen die langsamsten Punkte bei
53–54 km/h und heissen T13, Sabine-Schmitz-Kurve und Wehrseifen.

**Was das ueber die Zielzeiten sagt:** Die frühere Behauptung „40 bis 100
Sekunden zu leicht" stammte vom kaputten Follower und war falsch. Gegen eine
saubere Referenzrunde bleibt jetzt eine Luft von 15,8 bis 22,1 Prozent — für
einen Menschen an der Tastatur gegen etwas, das keine Fehler macht, ist das
plausibel. Die Spanne von 6,3 Punkten ist die einzige Unwucht: der MINI ist
mit 15,8 Prozent am schwersten, der Ferrari mit 22,1 am leichtesten. Ob das
angeglichen wird, ist eine Design-Entscheidung und keine Messfrage.

**Weiter offen: die Ducati.** 352 Kontakte, 45,7 Prozent neben der Strecke.
Der Follower fährt kein Motorrad. Eine Dämpfung des Lenkbefehls hat ihr wenig
geholfen (445 → 352) und den Autos gemischt geschadet (Taycan 14 → 34
Kontakte), war aber netto beim Abkommen ein Gewinn und ist deshalb drin. Was
fehlt, ist vermutlich ein eigenes Kurvenmodell für ein einspuriges Fahrzeug —
Schräglage statt Lenkwinkel.
