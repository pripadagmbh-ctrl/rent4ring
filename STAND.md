# STAND.md — Arbeitsstand

Stand: 27.08.2026, Branch `claude/rent4ring-review-0377f5`. Der Review-Backlog aus
REVIEW.md ist vollständig abgearbeitet; seitdem läuft Feature-Arbeit auf Zuruf. Live
auf GitHub Pages: <https://pripadagmbh-ctrl.github.io/rent4ring/>

Die Chronologie der Änderungen steht in [CHANGELOG.md](CHANGELOG.md), bewusst nicht
umgesetzte Nebenbefunde in [OFFEN.md](OFFEN.md). Dieses Dokument hält nur fest, was
gerade gilt und was man beim Weiterarbeiten wissen muss.

## Zuletzt gemergt (PR #23 und #24, beide live)

Streckenguide in der Garage, das Areal um 1,7° eingedreht, Wendehammer und
Verbindungsfahrbahn aus der Fahrbahn geschnitten, rote Couch im Showroom, Dale
animiert und neben Herrn Müller im HUD, Reifenquietschen nach Belastung,
Crash-Geräusche in drei Schichten plus Schleifen an der Leitplanke, CHANGELOG.md
angelegt.

## Offen entschieden, nicht offen vergessen

- **Zielrundenzeiten bleiben unverändert** (OFFEN.md O5). Der Auto-Fahrer aus
  `simulate.ts` verbringt 20 bis 53 Prozent der Runde neben der Strecke und
  rammt 111 bis 348 Mal die Leitplanke; seine Zeiten sind zu schnell, weil er
  abkürzt, nicht weil die Ziele zu weich wären. Solange das so ist, gibt es
  keinen belastbaren Maßstab für den Schwierigkeitsgrad.
- **Gesprochene Zeilen wurden versucht und wieder entfernt.** Die Browser-
  Sprachausgabe (`speechSynthesis`, deutsche Stimme für Herrn Müller auf
  englischem Text, britische für Dale) war gebaut und gemessen, klang aber zu
  künstlich, um sie auszuliefern — Ursache ist die Engine: auf dem Testrechner
  stellt Chrome nur sechs alte Microsoft-SAPI-Stimmen bereit, keine neuronalen.
  Der Commit steht in der Historie des Branches und wurde bewusst
  zurückgenommen, nicht vergessen. Wer es wieder aufgreift, findet dort auch
  die beiden Fallen: die stille Aufwärmzeile verschluckt die erste echte, und
  `onend` feuert nicht auf jeder Engine.
  Ein Aufnahmeskript mit allen 184 Zeilen in 29 Aufnahmen existiert für den
  Fall, dass echte Aufnahmen kommen.

## Wichtige Lektion für Grafik-Debugging in diesem Projekt

Ein naiver Ray-gegen-Welt-AABB-Test liefert bei rotierten Boxen (die Hofgruppe
steht um ~38° gedreht, seit dem Eindrehen um weitere 1,7°) massiv falsche
Näherungstreffer — die Welt-AABB einer rotierten Box ist immer größer als die Box
selbst und markiert Punkte als „innerhalb", die es geometrisch nicht sind. Korrekt
ist nur ein Test nach Transformation des Rays in den Objekt-Lokalraum
(`inverse(matrixWorld)` anwenden, dann gegen die unrotierte lokale BoundingBox
prüfen).

Zweite Lektion, aus derselben Ecke: Screenshots direkt nach `click("Drive now")`
sind unzuverlässig — sie zeigen teils einen stehengebliebenen oder leeren Frame.
Verifiziert wird über den pausierten echten Spielzustand (`game.paused = true`,
`composer.render()`, Pixel-Sampling des WebGL-Canvas), nicht per Sichtprüfung.

## Geometrie des Hofs — was aneinanderhängt

Alles am Rent4Ring-Areal hängt an `homeBaseFrame()` in `departure.ts`: Halle, Hof,
Rampe, Wendehammer, Flotten-Stellplätze, Publikum, Kamera und die Ausfahrtsroute.
Wer dort etwas dreht oder verschiebt, verschiebt alles mit — das ist Absicht. Zwei
Fallen dabei:

1. Die Drehung (`TWIST`) geht um die **Einmündung**, nicht um den Hallenursprung.
   Um den Ursprung gedreht reißt das ferne Ende der Verbindungsfahrbahn von der
   Straße ab, die es treffen soll.
2. `TWIST_PIVOT` ist bewusst ausgeschrieben und nicht aus `LINK` abgeleitet. Als
   Mittelwert der Rechteckkanten wäre es beim nächsten Neuzuschnitt der Fahrbahn
   mitgewandert und hätte still das ganze Areal verschoben.

Das Grundstück liegt in einer Haarnadel: die Burgstraße läuft an der Halle vorbei
hinaus und quert oben wieder nach Osten. Deren Kante liegt lokal bei etwa
`z = 26,6 − 0,103·x`. Wer dort Flächen anlegt, prüft gegen diese Linie.

## Prüfschritte

- `npx tsc --noEmit` — grün.
- `npx vite build` — grün. Warnt über die Bundle-Größe (1,06 MB, 308 kB gzip);
  bekannt, nicht behoben.
- Fahrzeug-Simulation: `npx vite build --ssr scripts/simulate.ts --outDir scripts/dist`,
  dann `node scripts/dist/simulate.js`. Pflicht vor und nach jeder Änderung an
  Tuning-Werten, mit Vorher/Nachher-Zahlen im Commit.
- Dev-Server im Worktree über die Browser-Vorschau (`.claude/launch.json`, Port 5180
  mit `autoPort`). Nach `npm install` im Worktree den Server neu starten — Vites
  Dependency-Re-Optimierung nach Lockfile-Änderungen kann den laufenden Prozess in
  einen kaputten Zustand bringen (beobachtet: ERR_CONNECTION_RESET-Kaskade, HMR
  liefert danach falsche oder leere Frames).
- Die Vorschau kompositiert keine Frames, solange das Panel nicht sichtbar ist:
  keine Screenshots, kein `requestAnimationFrame`, keine Scroll-Events. Für
  Verifikation stattdessen den Spielzustand direkt steppen (`game.running = false`,
  dann `game.updateDeparture(dt)` in einer Schleife) und Werte auslesen.

## Frühere Merges (Kontext für die Historie)

- PR #1: Review-Fixes (H1–H13), gemergt mit einer parallelen Session, die dieselben
  Befunde unabhängig umgesetzt hatte (Merge-Commit `60fc97b`).
- PR #2 (extern gemergt, `378f505`): der komplette restliche M/N-Review-Backlog aus
  einer weiteren parallelen Session. `REVIEW.md` ist damit inhaltlich vollständig
  abgearbeitet.
- PR #3: Grafikfehler-Rundfahrt (Hallenbeleuchtung, Ausfahrtkamera, Ribbon-
  Rückseiten, Leitplankenpfosten, Wiesenüberschneidung).
- PR #20–#22: Ducati, Hofszene nach der schwarzen Flagge, Statisten, Dale als
  Instructor, Blitzer, Drift-Fix.
- PR #23, #24: siehe oben.
