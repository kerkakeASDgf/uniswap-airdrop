// Netlify Edge Function — Dynamic OG Meta Tag Injector
// Intercepts requests to / with ?contract= param, injects correct OG tags for bots.
// Regular users see the normal site; crawlers (Twitter, Discord, Telegram) get
// a modified HTML response with the right og:image pointing to /og-image.

const BOT_PATTERNS = [
  "Twitterbot",
  "facebookexternalhit",
  "LinkedInBot",
  "TelegramBot",
  "Discordbot",
  "Slackbot",
  "WhatsApp",
  "Googlebot",
  "bingbot",
  "DuckDuckBot",
  "ia_archiver",
  "crawler",
  "spider",
  "bot",
];

function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some((p) => ua.includes(p.toLowerCase()));
}

async function fetchTokenMeta(contract) {
  if (!contract) return { name: "Community Airdrop", symbol: "TOKEN" };
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${contract}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { name: "Community Airdrop", symbol: "TOKEN" };
    const data  = await res.json();
    const pair  = data?.pairs?.[0];
    if (!pair) return { name: "Community Airdrop", symbol: "TOKEN" };
    const base  = pair.baseToken || {};
    return {
      name:   base.name   || "Community Airdrop",
      symbol: base.symbol || "TOKEN",
    };
  } catch {
    return { name: "Community Airdrop", symbol: "TOKEN" };
  }
}

export default async function handler(request, context) {
  const url      = new URL(request.url);
  const contract = url.searchParams.get("contract");

  // Only intercept index requests that have a contract param
  if (!contract) return context.next();

  // Fetch the original page
  const response = await context.next();
  if (!response.ok) return response;

  const ua     = request.headers.get("user-agent") || "";
  const origin = url.origin; // e.g. https://yoursite.netlify.app

  const ogImageURL = `${origin}/og-image?contract=${encodeURIComponent(contract)}`;
  const pageURL    = `${origin}/?contract=${encodeURIComponent(contract)}`;

  // Always inject meta tags (bots and users alike benefit, but bots need it)
  const { name, symbol } = await fetchTokenMeta(contract);
  const ticker  = symbol.startsWith("$") ? symbol : `$${symbol}`;
  const title   = `${name} (${ticker}) — Community Airdrop on Uniswap`;
  const desc    = `Claim your ${name} (${ticker}) tokens. Community airdrop distributed via Uniswap Protocol.`;

  const newMetaTags = `
    <meta property="og:type"        content="website" />
    <meta property="og:url"         content="${pageURL}" />
    <meta property="og:title"       content="${title}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:image"       content="${ogImageURL}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt"   content="${title}" />
    <meta name="twitter:card"        content="summary_large_image" />
    <meta name="twitter:title"       content="${title}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image"       content="${ogImageURL}" />
    <meta name="twitter:image:alt"   content="${title}" />
    <meta name="description"         content="${desc}" />
  `.trim();

  // Read the HTML and inject tags right before </head>
  let html = await response.text();

  // Remove any existing og:/twitter: meta tags that are hardcoded
  html = html
    .replace(/<meta[^>]+property="og:image"[^>]*>/gi, "")
    .replace(/<meta[^>]+property="og:title"[^>]*>/gi, "")
    .replace(/<meta[^>]+property="og:description"[^>]*>/gi, "")
    .replace(/<meta[^>]+property="og:url"[^>]*>/gi, "")
    .replace(/<meta[^>]+property="og:type"[^>]*>/gi, "")
    .replace(/<meta[^>]+property="twitter:image"[^>]*>/gi, "")
    .replace(/<meta[^>]+property="twitter:title"[^>]*>/gi, "")
    .replace(/<meta[^>]+name="twitter:card"[^>]*>/gi, "")
    .replace(/<meta[^>]+name="twitter:title"[^>]*>/gi, "")
    .replace(/<meta[^>]+name="twitter:description"[^>]*>/gi, "")
    .replace(/<meta[^>]+name="twitter:image"[^>]*>/gi, "")
    .replace(/<meta[^>]+name="description"[^>]*>/gi, "");

  // Inject before </head>
  html = html.replace("</head>", `${newMetaTags}\n</head>`);

  return new Response(html, {
    status:  response.status,
    headers: {
      ...Object.fromEntries(response.headers),
      "Content-Type": "text/html; charset=utf-8",
      // Don't cache the HTML response; only cache the image
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}

export const config = {
  path: "/",
};
