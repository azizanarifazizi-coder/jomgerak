# JomGerak

Neighbourhood fitness community for Sime Darby Property townships.
Sime Darby Property University Hackathon 2026 · People theme.

- **mobile/** – the resident app (Expo / React Native). Runs on your phone through Expo Go.
- **dashboard/** – the management dashboard (React + Vite). Runs in a browser.
- **shared/** – the logic both use: simulated park history, groups, and the two machine-learning models.
- **supabase/** – the database setup script.

Both apps work without a database ("demo mode"). Connect Supabase so a report sent from the phone appears live on the dashboard.

---

## 1. Before you start

Install once:

1. **Node.js** (LTS) from nodejs.org, and **VS Code** from code.visualstudio.com.
2. **Expo Go** on your phone (Play Store or App Store).
3. Your phone and laptop must be on the **same Wi-Fi**.

Open this `jomgerak` folder in VS Code: **File → Open Folder**. Open a terminal with **Terminal → New Terminal**.

## 2. Set up the database (Supabase, free)

1. Go to **supabase.com**, sign up and click **New project**. Pick the Singapore region. Wait until it is ready.
2. In the left menu open **SQL Editor → New query**. Open `supabase/schema.sql` in VS Code, copy all of it, paste it into Supabase and click **Run**. You should see "Success".
3. Open **Project Settings → API** (or **Connect**). Copy two values:
   - **Project URL** (looks like `https://abcdxyz.supabase.co`) 
   - **anon public** key (a long text starting with `eyJ` or `sb_publishable_`)

## 3. Run the dashboard

In the VS Code terminal:

```
cd dashboard
copy .env.example .env        (Mac: cp .env.example .env)
```

Open `dashboard/.env` and paste your two values after the `=` signs. Save. Then:

```
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173). The header should say **Live**.

## 4. Run the mobile app

Open a **second terminal** (the **+** button in the terminal panel):

```
cd mobile
copy .env.example .env        (Mac: cp .env.example .env)
```

Paste the same two values into `mobile/.env` and save. Then:

```
npm install
npx expo start
```

A QR code appears. **Android:** open Expo Go and tap *Scan QR code*. **iPhone:** scan it with the Camera app.

If the phone can't connect, stop with **Ctrl + C** and run `npx expo start --tunnel` instead.

## 5. Demo flow (for the video)

1. On the phone: **Fill in demo resident** → **Verify my home**.
2. **Parks**: choose a park, see when it is usually busy, tap **I'm here** (works 6 am – 10 pm).
3. **Groups**: join "Night Walk Starters", which needs more members to start.
4. **Buddies**: change your preferences and watch the matches re-rank.
5. **Report**: Lighting → Lakeside Track → North stretch → send.
6. On the laptop dashboard: the report appears, the Lakeside alert stays **High priority**, and the pin shows on the path heat map. Change its status to **Fixed**: the phone updates.
7. Before recording again, press **Reset demo data** at the bottom of the dashboard, and **Reset verification (demo)** in the app header.

## 6. Put it online (optional)

- **Code:** create a GitHub repository and upload this folder. `.env` files are ignored by git, so your keys are not uploaded.
- **Dashboard:** on vercel.com, import the repository, set **Root Directory** to `dashboard`, add the two `VITE_SUPABASE_…` values under Environment Variables, and deploy.

---

## How it works

**Anomaly alerts (ridge regression).** One model per park learns the normal number of people for each day and time slot from weeks 1–6 (17 inputs: day, slot, weekend × slot, week trend). Each session in weeks 7–8 gets a z-score against that expectation; a slot is flagged when its average is 2σ or more below normal. On the simulated data it explains 98% of the variation and flags only the injected Lakeside lighting fault.

**Buddy matching (logistic regression).** Learns from 896 simulated past pairings which neighbour pairs keep exercising together (6 inputs: schedule overlap, level match, same precinct, next-door precinct, shared activities, both beginners). AUC 0.72 on held-out pairs.

**Privacy.** Verified residents only (checked in the database by `verify_resident`), an anonymous device id instead of names, no GPS, rough time slots, and busyness slots under 5 people hidden.

## Honest limits of this prototype

- Weeks 1–8 of park history, resident profiles and buddy outcomes are **simulated**. Reports, check-ins, joins and verifications are real and live.
- Anyone with the app key can read and add rows; only report status can be changed. A pilot would use Supabase Auth with separate resident and management roles.
- Resident codes use a demo formula. A pilot would issue them from SDP's handover records.
