# SZEngine Testbench V5 – N/A és hiba miatti leállítás

## Telepítés meglévő V4 projektre
1. Állítsd le a helyi Vite szervert (Ctrl+C). Másold a frissítő ZIP tartalmát a projekt gyökerébe, felülírással. A `.env.local` és a meglévő SQL adatok maradnak.
2. Éles adatbázis esetén futtasd egyszer a `supabase/migrations/003_skip_and_fault_issue.sql` fájlt a Supabase SQL Editorban, lehetőleg lezárt járatás mellett, biztonsági mentés után. A 001/002 migrációkat ne futtasd újra. Új adatbázisnál a sorrend 001, 002, 003.
3. `npm.cmd run dev`. A csomagfüggőségek nem változtak. Demóhoz nem szükséges SQL. `npm.cmd run test:workflow` és `npm.cmd run build` ellenőrzésre.

## Használat
- Mindkét checklistben külön N/A gomb: csak a ténylegesen nem alkalmazható pontokra (például nincs beépítve). Megerősítést kér. A checkbox üres marad. Az N/A gomb ismételt megnyomásával visszavonható, a checkbox kipipálása teljesítetté alakítja. A lezáráshoz minden pont teljesített vagy kifejezetten N/A; a függőben hagyott pont blokkolja a lezárást.
- Az archívum külön mutatja a teljesített, kihagyott és jelöletlen pontokat. A kihagyásnak is van felhasználója és ideje. A régi rekordok változatlanok.
- Hiba miatti leállítás után a sikeres státuszmentés automatikusan megnyitja a hibajegyűrlapot. Előre kitöltött cím, járatási cél és magas prioritás; a hibajegy valódi SQL-kapcsolattal tartozik a járatáshoz. Mentés után visszatérés az aktív leállítási checklisthez. A hibajegy felvétele halasztható; az aktív járatásból és a naplóból később is indítható. A leállítási checklist továbbra is lezárandó, a fékpad hibaállapotban marad, amíg azt jogosult kezelő nem módosítja.
- A felület kizárólag dokumentációs rendszer, nem vezérli a fizikai indítást/leállítást. Szükséges biztonsági ellenőrzés nem hagyható ki csak azért, mert sikertelen vagy nem lett elvégezve.

## Ellenőrzés
A demó workflow tesztjei és a domain TypeScript ellenőrzése futtathatók. Éles PostgreSQL migrációt és teljes Vite buildet a saját környezetben ellenőrizd.
