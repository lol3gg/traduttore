# NomeApp

Chat privata tra due persone con traduzione automatica (IT ↔ RU), presence in tempo reale, PWA installabile e notifiche push OneSignal.

## Stack

- Vite + React + TypeScript + Tailwind CSS
- Supabase (Realtime, Edge Functions)
- DeepL (traduzione via Edge Function)
- PWA (`vite-plugin-pwa`)
- OneSignal (Web Push)

## Setup locale

1. Copia `.env.example` in `.env` e inserisci:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ONESIGNAL_APP_ID`
2. Esegui gli schema SQL in `supabase/migrations/` sul progetto Supabase:
   - `001_init.sql` (tabelle + seed)
   - `002_rls.sql` (policy permissive per anon key senza Auth)
3. Deploya le Edge Function e imposta i secrets:
   - `translate-message` → `DEEPL_API_KEY`
   - `send-notification` → `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`, `APP_URL`
4. Avvia:

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

La build produce la cartella `dist/` con service worker e manifest PWA.

### Icone PWA

Le icone placeholder sono in `public/`. Per rigenerarle:

```bash
node scripts/generate-icons.mjs
```

Poi sostituisci i PNG con le tue icone custom (mantieni gli stessi nomi file).

## Deploy su Vercel

1. Push del repo su GitHub.
2. Su [vercel.com](https://vercel.com): **Add New Project** → importa il repo.
3. Imposta le Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ONESIGNAL_APP_ID`
4. Framework preset: **Vite** (build command `npm run build`, output `dist`).
5. Deploy. Usa HTTPS (obbligatorio per PWA, OneSignal e installazione).

Dopo ogni redeploy, grazie a `registerType: 'autoUpdate'`, riaprendo l’app lo shell si aggiorna da solo.

## OneSignal (notifiche push)

1. Crea un’app **Web Push** su OneSignal (Typical Site / Custom Code).
2. Copia **App ID** → `VITE_ONESIGNAL_APP_ID` (Vercel + `.env`) e secret `ONESIGNAL_APP_ID`.
3. Copia **REST API Key** → secret Supabase `ONESIGNAL_REST_API_KEY`.
4. Imposta `APP_URL` (URL pubblico dell’app, es. `https://nomeapp.vercel.app`) come secret della function `send-notification`.
5. Deploy:

```bash
supabase functions deploy send-notification
supabase secrets set ONESIGNAL_APP_ID=... ONESIGNAL_REST_API_KEY=... APP_URL=https://...
```

Dopo la selezione del profilo, l’app chiede il permesso notifiche e salva `onesignal_player_id` su `profiles`.

### iOS

Le push su iOS 16.4+ funzionano **solo** se l’app è aggiunta alla Home Screen (standalone). Da Safari normale non arrivano.

## Installare l’app (PWA)

### Android (Chrome)

1. Apri il sito deployato in Chrome.
2. Menu **⋮** → **Installa app** oppure **Aggiungi a schermata Home**.
3. Conferma. L’icona compare sulla home e apre l’app in modalità standalone.
4. Accetta il permesso notifiche quando richiesto.

### iOS (Safari, 16.4+)

1. Apri il sito in **Safari** (non Chrome).
2. Tocca **Condividi** (quadrato con freccia).
3. Scegli **Aggiungi a Home** / **Add to Home Screen**.
4. Apri l’app dalla Home e accetta le notifiche (necessario per le push).

## Note

- L’app richiede connessione (Supabase Realtime): la cache PWA serve lo shell, non un uso offline completo.
- Se l’utente rifiuta le notifiche, la chat resta usabile: `onesignal_player_id` resta `null` e non riceve push.
