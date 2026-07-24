# Generator raport balanta pe conturi (web)

Aplicatie web statica pentru analiza rapida a unei balante pe conturi si generarea unui email/raport catre administrator.

## Ce face

- importa fisiere `.csv`, `.xls`, `.xlsx`;
- detecteaza automat structura de balanta pe conturi, organizata pe ani/luni (foi de tip `2024`, `2025`, `2026`);
- optional, poate interpreta si fisiere cu structura de formular financiar (unde apar randuri de tip `Nr. rd.`);
- calculeaza indicatori esentiali:
  - total active,
  - active circulante,
  - datorii curente,
  - datorii pe termen lung,
  - capitaluri proprii,
  - cifra de afaceri,
  - profit/pierdere net(a),
  - fond de rulment,
  - lichiditate curenta,
  - grad de indatorare,
  - solvabilitate;
- genereaza text de email in limba romana si link `mailto:`.

Raportul incepe cu o sectiune **"Rezumat pe intelesul administratorului"** - fara jargon contabil - care contine:
- verdict pe scurt (profit/pierdere, situatie sanatoasa sau cu risc);
- "Ce functioneaza bine" - punctele forte identificate automat;
- "Ce necesita atentie" - riscurile si problemele detectate (lichiditate, indatorare, marja, dividende, amenzi etc.);
- "Recomandari concrete" - actiuni sugerate pe baza cifrelor gasite.

Sub aceasta sectiune ramane raportul tehnic detaliat (cifre pe conturi, rate financiare), util pentru contabil.

## Istoric si comparatie in timp (Cloudflare)

Aplicatia se poate conecta optional la un API propriu, gazduit pe Cloudflare (Worker + baza de date D1),
pentru a pastra un instantaneu (venituri, cheltuieli, rezultat, marja) de fiecare data cand generezi un
raport, si a compara evolutia lunara pe parcursul anului - util pentru ca, de la aparitia OUG 138/2024,
balanta de verificare se intocmeste lunar pentru toate firmele.

- Codul API-ului si pasii de instalare (o singura data, ~10 minute) sunt in folderul `worker/`
  ([worker/README.md](worker/README.md)).
- Odata publicat, introduci adresa API si un token in aplicatie, in sectiunea
  "Sincronizare in cloud (Cloudflare)" din formular.
- Dupa configurare, sub grafice apare sectiunea "Istoric si comparatie in timp": tabel + grafic cu
  evolutia lunara, plus optiuni de stergere si export JSON.
- Fara aceasta configurare, aplicatia functioneaza exact ca inainte (fara istoric persistent).

Pentru fisiere de tip balanta pe conturi, aplicatia extrage:
- total venituri,
- total cheltuieli,
- rezultat net estimat,
- marja neta estimata,
- ultima luna cu date nenule.

Aplicatia afiseaza si grafice de evolutie:
- comparatie anuala (YTD) pentru venituri, cheltuieli, profit pe toti anii existenti in tab-uri;
- comparatie lunara intre anul curent si anul precedent pentru venituri, cheltuieli si profit.

## Utilizare

1. Deschide fisierul `index.html` in browser.
2. Completeaza datele firmei si ale administratorului.
3. Incarca fisierul balantei.
4. Apasa `Genereaza raport`.
5. Foloseste:
   - `Copiaza text` pentru clipboard;
   - `Deschide email` pentru draft automat in clientul de email local.

## Observatii de format pentru fisier

- Aplicatia identifica foile anuale, conturile contabile si randurile de sumar (de exemplu `Total Venituri`, `Total Cheltuieli`, cont `121`).
- Pentru fiecare cont/rand relevant, aplica reguli de agregare pe luni si pe total perioada.

## Fisiere proiect

- `index.html` - interfata.
- `styles.css` - stilizare.
- `app.js` - logica de import, calcul si generare raport.
- `template-bilant-minim.csv` - exemplu minim de test.

## Limitari

- Este un instrument de sinteza, nu inlocuieste analiza contabila detaliata.
- In functie de structura exportului, pot fi necesare ajustari in maparea randurilor din `app.js`.
