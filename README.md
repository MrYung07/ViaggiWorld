# ViaggiWorld · Supabase + Vercel + Stripe

Il repository usa HTML/CSS/JavaScript, Supabase per utenti/database/chat, Vercel Functions per il backend e Stripe Checkout per i pagamenti.

## 1. Crea il progetto Supabase
1. Crea un progetto su https://supabase.com/.
2. Apri **SQL Editor**, incolla ed esegui tutto `supabase/schema.sql`.
3. Vai in **Project Settings → API** e copia Project URL e la chiave **anon/public**.
4. In `app.js`, sostituisci `https://YOUR_PROJECT.supabase.co` e `YOUR_SUPABASE_ANON_KEY` con i tuoi valori pubblici. La chiave anon è pensata per il browser; la sicurezza dipende da RLS.

## 2. Crea l'amministratore
1. Avvia il sito e registra il tuo account.
2. In Supabase → SQL Editor esegui, sostituendo l'email con la tua:
   `update public.profiles p set role = 'admin' from auth.users u where p.id = u.id and u.email = 'la-tua-email@example.com';`
3. Ricarica il sito. L'area Gestisci offerte consente agli amministratori di pubblicare destinazioni e prezzi.

## 3. Collega Vercel
1. Importa il repository GitHub `MrYung07/ViaggiWorld` in https://vercel.com/.
2. Vercel rileva `vercel.json`; installa le dipendenze da `package.json`.
3. In **Project → Settings → Environment Variables**, aggiungi:
   - `SUPABASE_URL`: Project URL
   - `SUPABASE_ANON_KEY`: chiave anon/public
   - `SUPABASE_SERVICE_ROLE_KEY`: service_role key (segreta, solo server)
   - `STRIPE_SECRET_KEY`: chiave Stripe secret (inizia con `sk_test_` per i test)
   - `STRIPE_WEBHOOK_SECRET`: secret dell'endpoint webhook Stripe
4. Fai redeploy dopo aver salvato le variabili.

## 4. Configura Stripe
1. Crea/usa un account su https://stripe.com/ e inizia in modalità test.
2. In Stripe → Developers → Webhooks aggiungi endpoint `https://TUO-DOMINIO.vercel.app/api/stripe-webhook`.
3. Sottoscrivi gli eventi `checkout.session.completed`, `checkout.session.async_payment_succeeded` e `checkout.session.async_payment_failed`.
4. Copia il signing secret che inizia con `whsec_` in `STRIPE_WEBHOOK_SECRET`.
5. Prova un pagamento usando le carte di test ufficiali di Stripe. Passa in modalità live solo dopo aver verificato prezzi, policy, condizioni di vendita, rimborsi e obblighi fiscali.

## 5. Note di sicurezza
- Non inserire mai chiavi secret o service-role in `app.js` o in file committati.
- Il backend rilegge il prezzo dal database: non si fida dell'importo inviato dal browser.
- Gli ordini vengono segnati come pagati solo dopo il webhook Stripe verificato.
- La demo iniziale è chiaramente indicata e non permette pagamenti reali.
- Prima del lancio aggiungi termini e condizioni, privacy/cookie policy, contatti assistenza e un flusso di rimborso.
- Il codice è una base di partenza: testare in un ambiente staging prima di accettare pagamenti reali.

## File principali
- `index.html`, `style.css`, `app.js`: frontend.
- `supabase/schema.sql`: tabelle, trigger e Row Level Security.
- `api/create-checkout-session.js`: checkout sicuro.
- `api/stripe-webhook.js`: conferma pagamento verificata.
