# OFFEN.md — unterwegs aufgefallen, bewusst NICHT umgesetzt

Sammelstelle für Dinge, die bei der Umsetzung der REVIEW.md-Befunde auffielen,
aber **nicht** in REVIEW.md stehen. Laut Auftrag hier notiert statt umgesetzt.

---

## O1 — `npx tsc --noEmit` schlägt schon im Ausgangszustand fehl

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

**Optionen:** (a) `@types/node` als devDependency + `"types": ["node"]` in tsconfig,
(b) `import.meta.env` statt `process.env` verwenden (Vite-idiomatisch, keine neue
Abhängigkeit), (c) `vite.config.ts` aus dem Typecheck ausschließen.
Empfehlung: (b) — passt zum bereits genutzten `import.meta.env.DEV`.

---

## O2 — `package-lock.json` trägt einen veralteten Projektnamen

Das Lockfile nennt das Projekt an zwei Stellen `rent4ring`, `package.json` dagegen
`rent4ring-home-circuit`; zusätzlich steht im Lockfile ein `"license": "ISC"`, das
`package.json` nicht führt. Ein `npm install` korrigiert beides automatisch und
erzeugt dadurch einen Diff, der mit keiner inhaltlichen Änderung zu tun hat.

**Warum nicht umgesetzt:** Kein Befund in REVIEW.md; die Änderung wurde bewusst
verworfen, damit kein sachfremder Diff in den Befund-Commits landet.

**Relevanz:** Kosmetisch. Fällt aber bei jedem frischen `npm install` wieder an und
verschmutzt dann den Arbeitsbaum.

---

## O3 — M15 ist ohne messbare Wirkung geblieben (dokumentiert, nicht offen)

Der dynamische Bremshorizont (M15) hat die Lap-Times aller sieben Autos **exakt
unverändert** gelassen. Grund: Mit den realen Grip-Werten der Flotte (1,05–1,38)
liegt die Grenz-Bremsdistanz nur knapp über den alten fixen 260 m und bindet auf
dieser Strecke praktisch nie. Der Befund ist trotzdem behoben (die systematische
Schwäche für hypothetisch schnellere Autos ist weg), aber es gibt kein
Vorher/Nachher-Delta als Nachweis — hier nur festgehalten, damit das später nicht
als „Fix hat nicht gewirkt" missverstanden wird.
