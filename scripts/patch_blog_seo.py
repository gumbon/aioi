import os
import re
from pathlib import Path

BLOG_DIR = Path(__file__).parent.parent / "blog"
BASE_URL = "https://aioindicator.com"
OG_IMAGE = "https://aioindicator.com/assets/og-image.png"

POST_META = {
    "market-structure-bos-choch-explained.html":    ("2026-04-12", "11M"),
    "smart-money-trading-guide.html":               ("2026-04-12", "14M"),
    "dow-theory-trading-guide.html":                ("2026-04-08", "12M"),
    "multi-timeframe-analysis-guide.html":          ("2026-04-10", "13M"),
    "risk-management-probability-kelly-criterion.html": ("2026-04-12", "12M"),
    "liquidity-sweeps-stop-hunts-guide.html":       ("2026-04-06", "11M"),
    "volume-profile-poc-key-levels.html":           ("2026-04-12", "13M"),
    "ict-trading-setup-sessions-price-levels.html": ("2026-04-14", "12M"),
    "accumulation-zones-breakout-prediction.html":  ("2026-04-12", "11M"),
    "banker-momentum-institutional-flow.html":      ("2026-04-16", "14M"),
    "bos-choch-quality-scoring-guide.html":         ("2026-04-18", "13M"),
    "monte-carlo-simulation-trading.html":          ("2026-04-20", "11M"),
    "open-interest-cvd-crypto-futures.html":        ("2026-04-22", "12M"),
    "premium-discount-lookback-zones.html":         ("2026-04-24", "14M"),
    "smt-divergence-cross-symbol-analysis.html":    ("2026-04-26", "13M"),
    "top-bottom-confidence-scoring.html":           ("2026-04-28", "12M"),
    "trendline-breakout-liquidity-detection.html":  ("2026-04-30", "13M"),
    "magic-bands-atr-fibonacci-trading.html":       ("2026-05-02", "11M"),
    "aio-trading-stack-combination-guide.html":     ("2026-05-04", "12M"),
}

def extract_meta(html, prop):
    m = re.search(r'<meta\s+(?:property|name)="' + re.escape(prop) + r'"\s+content="([^"]*)"', html)
    return m.group(1) if m else ""

def extract_title(html):
    m = re.search(r'<title>([^<]+)</title>', html)
    return m.group(1).strip() if m else ""

patched = 0
skipped = 0

for fname, (date_iso, read_time) in POST_META.items():
    fpath = BLOG_DIR / fname
    if not fpath.exists():
        print("[skip] not found: " + fname)
        skipped += 1
        continue

    html = fpath.read_text(encoding="utf-8")

    if 'rel="canonical"' in html and '"@type": "BlogPosting"' in html:
        print("[ok]   already patched: " + fname)
        skipped += 1
        continue

    url = BASE_URL + "/blog/" + fname
    title = extract_title(html).replace('"', '\\"')
    description = extract_meta(html, "description").replace('"', '\\"')
    og_title = (extract_meta(html, "og:title") or title).replace('"', '\\"')

    inject = (
        "\n    <!-- Canonical -->\n"
        '    <link rel="canonical" href="' + url + '" />\n\n'
        "    <!-- Open Graph (image + twitter card) -->\n"
        '    <meta property="og:image" content="' + OG_IMAGE + '" />\n'
        '    <meta property="og:image:width" content="1200" />\n'
        '    <meta property="og:image:height" content="630" />\n'
        '    <meta property="og:site_name" content="AIO Indicator" />\n\n'
        "    <!-- Twitter Card -->\n"
        '    <meta name="twitter:card" content="summary_large_image" />\n'
        '    <meta name="twitter:site" content="@gumbon" />\n'
        '    <meta name="twitter:title" content="' + og_title + '" />\n'
        '    <meta name="twitter:description" content="' + description[:200] + '" />\n'
        '    <meta name="twitter:image" content="' + OG_IMAGE + '" />\n\n'
        "    <!-- Schema.org BlogPosting -->\n"
        '    <script type="application/ld+json">\n'
        '    {\n'
        '      "@context": "https://schema.org",\n'
        '      "@type": "BlogPosting",\n'
        '      "headline": "' + og_title + '",\n'
        '      "description": "' + description + '",\n'
        '      "url": "' + url + '",\n'
        '      "datePublished": "' + date_iso + '",\n'
        '      "dateModified": "' + date_iso + '",\n'
        '      "author": {\n'
        '        "@type": "Person",\n'
        '        "name": "AIO Indicator Team",\n'
        '        "url": "https://aioindicator.com/"\n'
        '      },\n'
        '      "publisher": {\n'
        '        "@type": "Organization",\n'
        '        "name": "AIO Indicator",\n'
        '        "url": "https://aioindicator.com/",\n'
        '        "logo": {\n'
        '          "@type": "ImageObject",\n'
        '          "url": "https://aioindicator.com/assets/favicon.ico"\n'
        '        }\n'
        '      },\n'
        '      "mainEntityOfPage": {\n'
        '        "@type": "WebPage",\n'
        '        "@id": "' + url + '"\n'
        '      },\n'
        '      "inLanguage": "en",\n'
        '      "timeRequired": "PT' + read_time + '"\n'
        '    }\n'
        '    </script>\n\n'
        "    <!-- Schema.org BreadcrumbList -->\n"
        '    <script type="application/ld+json">\n'
        '    {\n'
        '      "@context": "https://schema.org",\n'
        '      "@type": "BreadcrumbList",\n'
        '      "itemListElement": [\n'
        '        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://aioindicator.com/" },\n'
        '        { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://aioindicator.com/blog/" },\n'
        '        { "@type": "ListItem", "position": 3, "name": "' + og_title + '", "item": "' + url + '" }\n'
        '      ]\n'
        '    }\n'
        '    </script>'
    )

    if '</head>' not in html:
        print("[warn] no </head>: " + fname)
        continue

    html = html.replace('</head>', inject + '\n</head>', 1)
    fpath.write_text(html, encoding="utf-8")
    print("[patch] " + fname)
    patched += 1

print("\nDone: " + str(patched) + " patched, " + str(skipped) + " skipped")
