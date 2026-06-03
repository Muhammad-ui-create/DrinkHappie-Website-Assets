# Happie Chatbot — Setup Guide

This guide walks you through deploying the AI chatbot for drinkhappie.com.

The chatbot runs in two pieces:
1. **Frontend widget** (already added to your theme as `sections/happie-chatbot.liquid`)
2. **Backend worker** (this folder) — a small Cloudflare Worker that proxies requests to Claude API

The worker is needed because your Anthropic API key MUST NEVER be exposed in the browser.

---

## Step 1: Get an Anthropic API key

1. Go to https://console.anthropic.com
2. Sign up / log in
3. Go to **Settings → API Keys** → **Create Key**
4. Copy the key (starts with `sk-ant-...`)
5. Add at least $5 in billing credits (Settings → Billing)

**Cost estimate:** Using Claude Haiku 4.5 (cheapest model), expect ~$0.001 per conversation. $5 covers ~5,000 conversations.

---

## Step 2: Sign up for Cloudflare (free)

1. Go to https://cloudflare.com → **Sign Up**
2. The Workers free tier covers 100,000 requests/day — more than enough.

---

## Step 3: Install Wrangler (Cloudflare CLI)

Open PowerShell and run:

```powershell
npm install -g wrangler
wrangler login
```

This opens a browser window — log in with your Cloudflare account.

---

## Step 4: Deploy the worker

In PowerShell:

```powershell
cd "C:\Claude Code\Drink-Happie\chatbot-worker"

# Set the Anthropic API key as a secret (you'll be prompted to paste it)
wrangler secret put ANTHROPIC_API_KEY

# Deploy
wrangler deploy
```

After deploy, Wrangler prints a URL like:
```
https://happie-chatbot.YOUR-SUBDOMAIN.workers.dev
```

**Copy this URL.**

---

## Step 5: Connect the worker to your theme

1. Go to **Shopify Admin → Online Store → Themes → Customize**
2. In the left sidebar, scroll to the bottom — find **Happie Chatbot**
3. Paste the worker URL into **Worker URL**
4. Set:
   - **Support email** → your support email (e.g. `support@drinkhappie.com`)
   - **Bot name** → "Happie Assistant" (or whatever)
   - **Greeting message** → customize the first message
   - **Bot avatar** → upload the Happie cloud logo
   - **Brand color** → `#50b2bd` (Happie teal)
5. **Save**

The chatbot bubble will now appear on every page.

---

## Step 6: Test it

1. Visit drinkhappie.com
2. Click the chat bubble in the bottom-right
3. Try messages like:
   - "What's the difference between THC Seltzers and Fungi Fusion?"
   - "How fast does shipping take?"
   - "I want to talk to a human"

The "talk to a human" form submits via Shopify's built-in `/contact` endpoint — emails go to the address set in **Shopify Admin → Settings → Store details → Sender email**.

---

## Updating the bot's knowledge

Edit `worker.js` → `SYSTEM_PROMPT` constant.

Add new products, FAQs, policies — anything you want the bot to know. Then redeploy:

```powershell
wrangler deploy
```

Changes go live in seconds.

---

## Cost monitoring

- **Cloudflare Workers**: Free tier covers 100k requests/day. Beyond that: $5/mo for 10M requests.
- **Anthropic API (Claude Haiku 4.5)**:
  - ~$1 per 1M input tokens, ~$5 per 1M output tokens
  - With prompt caching (already enabled in worker), system prompt is cached after first request — cuts cost ~75%
  - Typical conversation: 5-10 messages, ~$0.001-0.003 each
  - 1,000 conversations/month ≈ $1-3

Check usage at https://console.anthropic.com/settings/billing

---

## Troubleshooting

**"Chatbot isn't fully configured yet" message in the chat**
→ Worker URL is empty in the section settings. Add it.

**"AI service unavailable"**
→ Worker can't reach Anthropic. Check:
  - `ANTHROPIC_API_KEY` is set: `wrangler secret list`
  - You have billing credits at console.anthropic.com
  - The model name in `worker.js` is current

**"Slow down — too many requests"**
→ Rate limiter hit. Default is 60/hour per IP.

**CORS errors in browser console**
→ Update `ALLOWED_ORIGIN` in `wrangler.toml` to match your domain, then redeploy.

---

## Files in this folder

- `worker.js` — the Cloudflare Worker code (system prompt + API proxy)
- `wrangler.toml` — Cloudflare deployment config
- `SETUP.md` — this guide
