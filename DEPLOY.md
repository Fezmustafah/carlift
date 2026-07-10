# Carlift Ops — Deploy Guide

Two accounts, ~15 minutes total. Do Part A first (Supabase), then Part B (Vercel).

---

## Part A — Supabase (~8 min)

1. Go to [supabase.com](https://supabase.com) → **New project**.
   - Name: `carlift`
   - Database password: pick a strong one, **save it somewhere**
   - Region: **Mumbai (ap-south-1)** — closest to Dubai
   - Wait ~2 min for it to provision.

2. Left sidebar → **SQL Editor** → **New query**.
   - Open `supabase/schema.sql` from this app folder, copy **everything**, paste, click **Run**.
   - Should say "Success". This creates all tables + security rules + 3 sample cars.

3. Fix your cars: left sidebar → **Table Editor** → **cars** table.
   - Edit the 3 rows: real driver names, seat counts (7 for a Previa, etc.). Add plates if you want.

4. Add your login: left sidebar → **Authentication** → **Users** → **Add user** → **Create new user**.
   - Email: your email. Password: pick one. **This is how you log into the app.**
   - Turn OFF "Auto Confirm User"? No — leave it ON (or tick "Auto Confirm") so you can log in immediately.

5. Get your keys: left sidebar → **Project Settings** (gear) → **API**.
   - Copy **Project URL** → this is `VITE_SUPABASE_URL`
   - Copy **anon public** key → this is `VITE_SUPABASE_ANON_KEY`
   - (The anon key is safe to be public — your data is protected by the security rules from step 2.)

---

## Part B — Vercel (~5 min)

Pick ONE path.

### Path 1 — GitHub (recommended: auto-redeploys when you change anything later)

1. Create an empty repo on GitHub (e.g. `carlift`). Don't add a README.
2. In this folder, push it (I already made the first commit for you):
   ```
   git remote add origin https://github.com/<your-username>/carlift.git
   git branch -M main
   git push -u origin main
   ```
3. Go to [vercel.com](https://vercel.com) → **Add New → Project** → **Import** your `carlift` repo.
4. Vercel auto-detects **Vite**. Leave build settings as-is.
5. Expand **Environment Variables**, add these 3:
   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your anon public key |
   | `VITE_OFFICE_WHATSAPP` | your office WhatsApp, e.g. `9715XXXXXXXX` (optional) |
6. Click **Deploy**. Wait ~1 min. You get a URL like `carlift.vercel.app`.

### Path 2 — Vercel CLI (no GitHub needed)

```
npm i -g vercel
vercel
```
Answer the prompts (link to your Vercel account, accept defaults). Then add the 3 env vars in the Vercel dashboard → your project → **Settings → Environment Variables**, and run `vercel --prod` again.

---

## Part C — QR cards

1. Take your live URL and add `/join`: e.g. `https://carlift.vercel.app/join`
2. Put that link into any QR generator (e.g. qr-code-generator.com).
3. Print **3 copies**, laminate, hang one in each car.
4. Test: scan it with your own phone → the registration form should open.

---

## Part D — Go live

1. Log into your app URL with the email/password from Part A step 4.
2. **Members → + Member**: enter the names from your 5-day pencil register. That's your starting roster.
3. Tell the 3 drivers (in Urdu): *"Paise mat lena. Har sawari ko bolo yeh QR scan kare."*
4. Broadcast to riders: pay office only, seat active after WhatsApp receipt.
5. Each morning: open **Expiring**, tap **Remind** on anyone due. Done.

---

## Later changes

If I edit the app later and you used Path 1: just `git push` and Vercel redeploys automatically. If you used Path 2: run `vercel --prod` again.
