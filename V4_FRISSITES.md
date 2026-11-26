# SZEngine Testbench V4 – Járatásközpontú ellenőrzés

## V3 frissítése
1. Állítsd le a helyi Vite szervert (Ctrl+C). Éles rendszernél előbb fejezd be a fizikailag folyó járatást, és a régi felületen is rögzítsd a leállítását.
2. Készíts mentést a projektről, éles használatnál a Supabase adatbázisról is.
3. A V4 frissítő ZIP **tartalmát** másold a meglévő `szengine-testbench` mappába. Engedélyezd a felülírást. Az `.env.local` és a korábbi fiókok megmaradnak. A függőségek nem változtak.
4. **Ha még csak demóban használod:** SQL nem szükséges. Futtasd `npm.cmd run dev`. A demó adatai a böngésző teljes frissítésekor visszaállnak; nem valódi többfelhasználós adattár.
5. **Ha már létezik Supabase V3 adatbázis:** a Supabase SQL Editorban futtasd egyszer a `supabase/migrations/002_journey_workflow.sql` teljes tartalmát. A `001_initial.sql`-t NE futtasd újra. A 002 migráció tranzakcióban fut, nem törli a régi adatokat. A migráció után a régi V3 kliens nem kompatibilis az új írási eljárásokkal; a V4-et használd.
6. **Új Supabase projektnél:** futtasd sorrendben az 001, majd 002 SQL fájlt. A README további Auth, Edge Function és GitHub Pages lépéseit is végezd el.
7. Futtasd a projekt gyökerében: `npm.cmd run test:workflow`, `npm.cmd run typecheck`, `npm.cmd run build`. A GitHub Pages publikálás előtt ellenőrizd a migrációt és a teljes folyamatot külön tesztadatbázison.

## Használat
- Checklist → Új járatás → setup kitöltése → Járatás létrehozása.
- 52 indítás előtti ellenőrzés, öt csoportban. Az összes pont teljesítése után zárd le a pre-start checklistet.
- Fizikai indítás után rögzítsd az indítást; a dashboard állapota üzemelre vált.
- Fizikai leállítás után rögzítsd a leállítást. Hiba miatti leállás esetén külön gomb áll rendelkezésre.
- 7 leállítási ellenőrzési pont teljesítése után zárd le a járatást. Addig másik nem indítható. Hibás állapot esetén a főoldalon a probléma elhárítása után kell manuálisan a leállított állapotot rögzíteni, mielőtt új járatás nyitható.
- Járatások: kereshető, szűrhető előzmények; setup, dátumok, felelős, ellenőrző személyek, mindkét checklist mentett szövege és időpontjai.
- Jogosultságok → Checklist sablonok → Szerkesztés: adminisztrátori sablonkezelés, csoportok/pontok átnevezése, hozzáadás, törlés, sorrendezés. A módosítások csak a következő új járatásokra vonatkoznak. Egy már megnyitott járatás mindkét sablonja a létrehozáskor rögzített verziót használja.
- Előkészítés megszakítása csak a fizikai indítás rögzítése előtt lehetséges, a megszakított rekord megmarad.

## Megvalósítási döntések
- Az összes felsorolt checkbox kötelező; nincs N/A vagy egygombos összes kijelölése. A setup választómezők, Map neve, cél, jelenlévők és nemnegatív kezdeti üzemóra kötelezők. A jelenlévők szabad szövegként adhatók meg, így vendégek is szerepelhetnek. A felelős alapértelmezésben a bejelentkezett felhasználó, aktív tagok közül választható. Az üzemóra kézzel megadott, nem számított érték.
- A választólisták lehetőségei a megadott fájl szerinti fix értékek; az admin a checkbox-pontokat és csoportokat szerkesztheti. A setup a checklist lezárásáig szerkeszthető.
- A V3 régi, nem párosított checklist rekordjai megmaradnak az SQL-ben; automatikus párosításra nincs elegendő információ. A Járatások oldal V4-től gyűjti a párosított dokumentációt.
- A V4 SQL két új táblát használ: `workflow_templates` (verziózott JSONB sablonok) és `workflow_runs` (egy rekord/járatás, két checklist-pillanatkép). RLS + szerveroldali RPC ellenőrzi a jogosultságokat és állapotátmeneteket. A régi `bench_runs`, `bench_state` és `status_events` státusznapló megmarad; a V4 állapotátmenetek az eredeti atomi státuszfrissítőt hívják. Az aktív járatás egyediségét részleges egyedi index is biztosítja.
- A webalkalmazás csak dokumentáció. Nem ad fizikai indítási engedélyt, nem vezérli a fékpadot, nem helyettesíti a vészleállítót és a jóváhagyott helyi biztonsági protokollt. Az itt megadott checklistet változatlan tartalommal vettük át, szakmai jóváhagyás szükséges az éles használat előtt.

## Tesztelés
A `tests/workflow-demo.cjs` 19 automatizált demólogikai ellenőrzést tartalmaz. A V4 elkészítésekor ezek mind sikeresek voltak; a domain TypeScript fájlok szigorú típusellenőrzése és a React TSX szintaktikai transzpiláció sikeres volt. A teljes React buildet és az SQL migráció futását élő Supabase adatbázison nem ellenőriztük ebben a környezetben, mert a függőségek és az adatbázis nem álltak rendelkezésre.
