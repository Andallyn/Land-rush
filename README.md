# Landrush Demand Engine

Landrush Demand Engine is a lead-generation platform prototype for acquiring and qualifying customers who need land to buy, lease, or inspect across Africa.

The current version is a dependency-free static web app that demonstrates:

- Customer lead capture for buying, leasing, and distress-sale interest.
- Public demand feeds from keyword search, subreddits, social media, property sites, forums, and WhatsApp/referrals.
- Lead scoring based on location specificity, budget, size, urgency, and inspection readiness.
- A filterable demand pipeline for sales, agents, and listing teams.
- Growth playbooks for listening, capture, verification, routing, nurturing, and measurement.

## Run locally

Open `index.html` directly in a browser, or serve the folder locally:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Verify JavaScript

```bash
node --check src/app.js
```

## Production connector blueprint

This prototype is front-end only. A production Landrush lead-gen platform should add a backend that:

1. Ingests feeds from:
   - Keyword search alerts and SEO landing pages.
   - Reddit API searches for location and land-intent keywords.
   - Social platforms and public groups where platform terms allow monitoring.
   - Forums such as Nairaland, Quora, agriculture boards, and diaspora communities.
   - Popular property/listing sites through partnerships, RSS, APIs, or permitted crawlers.
   - WhatsApp click-to-chat campaigns, agent referral links, and chatbot flows.
2. Normalizes each signal into a lead record with source, location, intent, budget, land size, timeline, and original message.
3. Scores leads for intent, affordability, urgency, inspection readiness, and fraud risk.
4. Routes hot leads to verified agents, landowners, or internal sales operators.
5. Syncs records to a CRM, email marketing tool, WhatsApp Business inbox, and analytics dashboard.
6. Adds consent, privacy, opt-out, and platform-specific compliance controls for every acquisition channel.

## Safety positioning

Landrush should continue to present itself as a connection and inspection platform. The lead-gen system should include notices reminding users not to pay before physically inspecting land and confirming ownership documents.