# einkaufszettel
PWA für Einkaufszettel

- Mehrere Listen auf der Startseite, z. B. Lebensmittel, Drogerie, Baumarkt
- Neue Listen starten leer oder mit der Lebensmittel-Vorlage
- Pro Liste: Supermarkt und Datum, Archiv vergangener Einkäufe und Statistik
- Listen und Abschnitte frei sortierbar; Produkte lassen sich in andere Listen verschieben oder kopieren
- Suche mit Schnell-Hinzufügen (Enter legt einen nicht gefundenen Begriff als Produkt an)
- Rezepte scannen (Foto oder Screenshot, Texterkennung direkt auf dem Gerät) oder als Text einfügen;
  fehlende Zutaten per Fingertipp auf eine Liste übernehmen, Rezepte merken und über die Suche wiederfinden
- Listen lassen sich per Einladungslink mit anderen teilen und werden live abgeglichen (siehe unten)
- Private Listen bleiben lokal im Browser; Backup/Wiederherstellung als JSON über das Menü der Startseite,
  mit Erinnerung, wenn das letzte Backup älter als 30 Tage ist

## Neue Version veröffentlichen
Nach Änderungen an den Dateien die Konstante `CACHE` in `sw.js` erhöhen. Installierte Apps zeigen dann
„Neue Version verfügbar – Neu laden“.

## Listen teilen (Firebase einrichten)
Geteilte Listen werden über [Firebase Firestore](https://firebase.google.com/) abgeglichen. Private Listen
bleiben weiterhin nur im Browser. Einmalige Einrichtung (ca. 10 Minuten, kostenloser „Spark“-Tarif):

1. Auf <https://console.firebase.google.com> ein Projekt anlegen (Google Analytics wird nicht benötigt).
2. **Build → Authentication → Jetzt starten → Anmeldeanbieter „Anonym“** aktivieren.
3. **Build → Firestore Database → Datenbank erstellen**, Standort z. B. `europe-west3 (Frankfurt)`,
   im Produktionsmodus starten.
4. Unter **Firestore → Regeln** den Inhalt von [`firestore.rules`](firestore.rules) einfügen und veröffentlichen.
5. **Projekteinstellungen → Allgemein → Meine Apps → Web-App hinzufügen** (Hosting nicht nötig) und die
   angezeigten Werte in [`firebase-config.js`](firebase-config.js) eintragen.
6. **Authentication → Einstellungen → Autorisierte Domains**: die Domain der App ergänzen,
   z. B. `<benutzername>.github.io`.
7. Versionsnummer `CACHE` in `sw.js` erhöhen, committen, pushen.

Benutzung: In einer Liste **Menü → Liste teilen** wählen und den Einladungslink verschicken. Wer den Link
öffnet, gibt einmalig seinen Namen ein; die Liste erscheint dann auf seiner Startseite. Änderungen sind
nach etwa einer Sekunde auf allen Geräten sichtbar, offline gemachte Änderungen werden nachgeliefert.
Der Punkt am Teilen-Symbol oben zeigt den Status: grün = aktuell, gelb = wird gesendet, rot = offline.

Wer den Link kennt, kann die Liste lesen und bearbeiten. „Teilen beenden“ löst die Liste nur auf dem
eigenen Gerät (sie bleibt als private Kopie erhalten).

## Rezepte
**Menü → Rezept scannen** öffnet Kamera oder Galerie. Die Texterkennung ([Tesseract.js](https://tesseract.projectnaptha.com/))
läuft im Browser; beim ersten Mal werden ca. 5 MB geladen, danach funktioniert sie auch offline. Die erkannten
Zutaten werden mit Menge angezeigt und, wo möglich, den Abschnitten der eigenen Listen zugeordnet.

In der installierten App (Chrome, Android) erscheint „Einkaufszettel“ außerdem im **Teilen**-Menü anderer Apps:
Screenshots oder markierter Rezepttext lassen sich direkt übergeben. Nach dem Update kann es einige Zeit dauern,
bis Android den neuen Eintrag anzeigt – notfalls die App einmal neu installieren.

## Veröffentlichen mit GitHub Pages
Im Repository unter **Settings → Pages** als Quelle „Deploy from a branch“, Branch `main`, Ordner `/ (root)`
wählen. Die App ist dann unter `https://<benutzername>.github.io/einkaufszettel/` erreichbar und lässt sich
in Chrome auf Android über **⋮ → App installieren** auf den Startbildschirm legen.
