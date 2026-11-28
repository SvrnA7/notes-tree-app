# Blattwerk

Notizen und Aufgaben mit einem Baum, der mit jeder erledigten Aufgabe wächst.

Installierbare Web-App (PWA), optimiert für das iPhone. Alle Daten bleiben auf dem Gerät (IndexedDB). Über **Einstellungen → Backup sichern** wird eine JSON-Datei exportiert, die auf einem anderen Gerät wieder geladen werden kann.

## Auf dem iPhone installieren
1. Seite in Safari öffnen
2. Teilen-Symbol → **Zum Home-Bildschirm**

## Hinweis für Updates
Bei jeder Änderung `VERSION` in `sw.js` erhöhen, sonst behalten iPhones die alten Dateien im Cache.

## Auf Vercel veröffentlichen
Die App ist eine reine statische Seite, es gibt keinen Build-Schritt.

1. Auf [vercel.com/new](https://vercel.com/new) das GitHub-Repo **notes-tree-app** importieren.
2. Framework Preset: **Other**. Build Command und Output Directory leer lassen (Root Directory `./`).
3. **Deploy** klicken. Jeder Push auf `main` wird danach automatisch neu veröffentlicht.

`vercel.json` sorgt dafür, dass `sw.js`, `index.html` und das Manifest nie veraltet aus dem Cache kommen. Schriften und Icons werden lange gecacht.
