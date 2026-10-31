# einkaufszettel
PWA für Einkaufszettel

- Mehrere Listen auf der Startseite, z. B. Lebensmittel, Drogerie, Baumarkt
- Neue Listen starten leer oder mit der Lebensmittel-Vorlage
- Pro Liste: Supermarkt und Datum, Archiv vergangener Einkäufe und Statistik
- Listen und Abschnitte frei sortierbar; Produkte lassen sich in andere Listen verschieben oder kopieren
- Suche mit Schnell-Hinzufügen (Enter legt einen nicht gefundenen Begriff als Produkt an)
- Alle Daten bleiben lokal im Browser; Backup/Wiederherstellung als JSON über das Menü der Startseite,
  mit Erinnerung, wenn das letzte Backup älter als 30 Tage ist

## Neue Version veröffentlichen
Nach Änderungen an den Dateien die Konstante `CACHE` in `sw.js` erhöhen. Installierte Apps zeigen dann
„Neue Version verfügbar – Neu laden“.
