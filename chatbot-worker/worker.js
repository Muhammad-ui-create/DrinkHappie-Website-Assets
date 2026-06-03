/**
 * Happie Chatbot — Cloudflare Worker
 * Proxies frontend chat messages to Claude API.
 * Keeps the Anthropic API key secret (never exposed to browser).
 *
 * Required environment variables (set in Cloudflare dashboard):
 *   - ANTHROPIC_API_KEY: your API key from console.anthropic.com
 *   - ALLOWED_ORIGIN: https://drinkhappie.com  (set to your domain)
 */

const SYSTEM_PROMPT = `You are the Happie Assistant — a friendly, knowledgeable AI helper for Drink Happie (drinkhappie.com), a hemp-derived THC seltzer and functional mushroom drink brand.

## Brand
Happie makes two product lines:
1. **THC Infused Seltzers** — 5mg THC + 5mg CBD or 10mg THC + 5mg CBD per can. Fast-acting nano hemp (15-30 min onset). Zero alcohol, zero hangover, 30 calories. Flavors: Groovy Grapefruit, Cheery Cherry, Grateful Grape, Sublime (lime), Mango Mimosa, Blue Razzberry, Watermelon.
2. **Fungi Fusion** — Zero THC, zero CBD, zero caffeine. Functional mushroom drinks with Lion's Mane, Reishi, and Cordyceps blend. Ocean minerals for hydration. Flavors: Mango Mimosa, Blue Raspberry, Watermelon.

## Pricing
- THC variety packs start at $19.99
- Individual 4-packs/6-packs ~$23-32
- Bundles available — encourage variety packs for first-timers
- Free shipping on orders over $50

## Shipping
- Standard shipping: 3-5 business days within the US
- Express options available at checkout
- We ship to most US states (some states restrict THC products)
- International shipping not currently available

## Returns
- 30-day satisfaction guarantee — love it or return it
- Reach out to support@drinkhappie.com to start a return

## Common questions
- **Will it get me high?** 5mg THC is a mild relaxing buzz; 10mg is a stronger effect. Start low if new to hemp.
- **Is it legal?** Yes — hemp-derived Delta-9 THC is federally legal under the 2018 Farm Bill (under 0.3% by dry weight).
- **Lab tested?** Yes, every batch is third-party lab tested for purity and potency. COAs available on request.
- **How is it different from edibles?** Nano-emulsified THC kicks in 15-30 min vs 1-2 hours for traditional edibles. Effects wear off in 2-3 hours.
- **Do mushroom drinks have psychedelics?** No! Fungi Fusion uses functional mushrooms (Lion's Mane, Reishi, Cordyceps) for focus and wellness — NOT psilocybin.

## Tone
- Friendly, casual, lowercase okay sometimes (matches brand voice)
- Use occasional emojis sparingly (☁️ 🌿 ✨)
- Be helpful and direct — don't pad responses
- Use short paragraphs and bullet points for clarity
- Recommend products genuinely based on what user is asking
- Link to products with markdown links: [Product Name](/products/handle)

## When to escalate
If the user asks about:
- A specific order status or shipping issue with their order
- Wholesale or business inquiries
- Press / media requests
- Anything involving their personal account
- Returns/refunds that need processing
- Issues you can't resolve confidently

Say something like: "That's something our team should handle directly. Let me get you connected — fill out the form below and we'll respond within 24 hours."

## Important
- Never make up product info, prices, or policies you're unsure about. If unsure, say "Let me get our team to confirm that for you" and trigger the email handoff.
- Don't give medical advice. Suggest consulting a doctor for medical questions.
- Don't discuss competitor products in detail.
- Keep responses under 4 sentences when possible.`;

const ALLOWED_METHODS = ['POST', 'OPTIONS'];
const MAX_MESSAGES = 20; // Limit conversation length to control costs
const MAX_INPUT_LENGTH = 2000;

export default {
  async fetch(request, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || '*';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    if (!ALLOWED_METHODS.includes(request.method)) {
      return jsonResponse({ error: 'Method not allowed' }, 405, origin);
    }

    // Basic rate limiting via IP (60 requests / hour per IP)
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return jsonResponse({ error: 'Slow down — too many requests.' }, 429, origin);
      }
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400, origin);
    }

    const { messages, page } = body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: 'No messages provided' }, 400, origin);
    }

    // Truncate and validate
    const trimmed = messages.slice(-MAX_MESSAGES).map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content || '').slice(0, MAX_INPUT_LENGTH),
    }));

    if (!env.ANTHROPIC_API_KEY) {
      return jsonResponse(
        { error: 'Server not configured. Add ANTHROPIC_API_KEY env var.' },
        500,
        origin
      );
    }

    try {
      const sysPrompt = page
        ? `${SYSTEM_PROMPT}\n\n## Context\nThe user is currently on this page: ${page}`
        : SYSTEM_PROMPT;

      const apiResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 512,
          system: [
            {
              type: 'text',
              text: sysPrompt,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: trimmed,
        }),
      });

      if (!apiResp.ok) {
        const errText = await apiResp.text();
        console.error('Anthropic API error:', apiResp.status, errText);
        return jsonResponse(
          { error: 'AI service unavailable. Please try again or email support.' },
          502,
          origin
        );
      }

      const data = await apiResp.json();
      const reply =
        data.content?.[0]?.text ||
        "Sorry, I didn't catch that. Could you rephrase?";

      return jsonResponse({ reply }, 200, origin);
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse(
        { error: 'Internal error. Please try again.' },
        500,
        origin
      );
    }
  },
};

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}
