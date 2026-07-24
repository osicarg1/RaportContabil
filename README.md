# API istoric balanta (Cloudflare Worker + D1)

Acest folder contine un API minimal, gazduit pe Cloudflare, care stocheaza intr-o baza de date D1
instantaneele (venituri/cheltuieli/rezultat/marja) generate de aplicatie, pentru comparatie in timp.

Nu necesita cont de gazduire separat, doar un cont Cloudflare (are un nivel gratuit suficient pentru acest volum de date).

## Pasi de instalare (o singura data)

1. **Instaleaza Wrangler** (CLI-ul Cloudflare), daca nu il ai deja:
   ```
   npm install -g wrangler
   ```

2. **Autentifica-te** in contul Cloudflare (se deschide un tab de browser):
   ```
   wrangler login
   ```

3. **Creeaza baza de date D1**, din acest folder (`worker/`):
   ```
   wrangler d1 create balanta_istoric_db
   ```
   Comanda iti va afisa un `database_id`. Copiaza-l si inlocuieste
   `PUNE_AICI_DATABASE_ID_PRIMIT_DE_LA_WRANGLER` din `wrangler.toml`.

4. **Creeaza tabelul** in baza de date:
   ```
   wrangler d1 execute balanta_istoric_db --remote --file=./schema.sql
   ```

5. **Seteaza un token secret** (parola API-ului tau) - alege un sir lung, aleator:
   ```
   wrangler secret put API_TOKEN
   ```
   Iti va cere sa introduci valoarea tokenului; pastreaz-o intr-un loc sigur, o vei introduce si in aplicatie.

6. **Publica Worker-ul**:
   ```
   wrangler deploy
   ```
   La final vei primi o adresa de forma:
   ```
   https://balanta-istoric-api.<subdomeniul-tau>.workers.dev
   ```

## Configurare in aplicatie

In `index.html`, deschide sectiunea **"Sincronizare in cloud (Cloudflare)"** si introdu:
- **Adresa API** = adresa primita la pasul 6 de mai sus.
- **Token API** = valoarea introdusa la pasul 5.

Aceste doua valori se salveaza local, in browserul tau (nu se trimit nicaieri altundeva), astfel incat
sa nu trebuiasca sa le retastezi de fiecare data. Trebuie introduse o singura data pe fiecare
calculator/browser de pe care vrei sa folosesti aplicatia.

## Ce se intampla dupa configurare

- La fiecare "Genereaza raport", aplicatia trimite automat un instantaneu (venituri, cheltuieli,
  rezultat, marja, si - unde e disponibil - lichiditate/grad de indatorare) catre acest API, asociat
  firmei si perioadei introduse in formular.
- Sectiunea "Istoric si comparatie in timp" din raport se incarca din acest API si arata evolutia
  lunara sub forma de tabel + grafic.
- Poti sterge o intrare individuala din tabel, sau exporta tot istoricul unei firme ca fisier JSON.

## Limitari si observatii de securitate

- Modelul de autorizare este simplu: **un singur token, partajat**, verificat pe fiecare cerere.
  Este suficient pentru un instrument de uz propriu/intern, dar **oricine detine tokenul poate
  citi, scrie si sterge orice inregistrare**, indiferent de firma. Nu distribui tokenul.
- Nu exista limitare de rate (rate limiting) sau audit log in aceasta implementare minimala.
- Datele stocate sunt doar instantaneele numerice (nu si textul integral al raportului).
- Daca vrei sa revoci accesul cuiva sau sa schimbi tokenul, ruleaza din nou
  `wrangler secret put API_TOKEN` cu o valoare noua si actualizeaza-l si in aplicatie.
