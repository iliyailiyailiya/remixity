#!/usr/bin/env python3
"""Builds the feature pages (public/<slug>/index.html) and public/sitemap.xml.

    python3 scripts/build-pages.py

Static, fully crawlable HTML (no JavaScript needed to read them). Every
feature described here exists in the app; screenshots are from the real app
with fictional demo songs (scripts/shots.mjs). English only for now.
"""
import html, json, datetime

SITE = "https://remixity.app"
TODAY = datetime.date.today().isoformat()
APP_IMG = (780, 1688)   # app screenshots (390×844 @2x)
STORY_IMG = (540, 960)  # story samples

import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from pages_content import EN, RU, RO, UI

LANGS = {"en": EN, "ru": RU, "ro": RO}
LOCALE = {"en": "en_US", "ru": "ru_RU", "ro": "ro_RO"}
LANG_NAME = {"en": "EN", "ru": "RU", "ro": "RO"}

def path(lang, slug):
    return f"/{slug}/" if lang == "en" else f"/{lang}/{slug}/"

def app_link(lang):
    return "/" if lang == "en" else f"/?lang={lang}"

e = html.escape


def img_tag(name, alt, lang, eager=False):
    w, h = STORY_IMG if name.startswith("story-") else APP_IMG
    suf = "" if lang == "en" else f"-{lang}"
    n = name + suf
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    srcset = f'/img/{n}-sm.webp {w // 2}w, /img/{n}.webp {w}w'
    return (f'<img src="/img/{n}.webp" srcset="{srcset}" sizes="(min-width: 820px) 320px, 78vw" '
            f'width="{w}" height="{h}" alt="{e(alt)}" {load} decoding="async" />')


def page(lang, p):
    pages = LANGS[lang]
    by_slug = {q["slug"]: q for q in pages}
    ui = UI[lang]
    url = SITE + path(lang, p["slug"])
    app = app_link(lang)
    alternates = "".join(
        f'\n    <link rel="alternate" hreflang="{l}" href="{SITE}{path(l, p["slug"])}" />' for l in LANGS
    ) + f'\n    <link rel="alternate" hreflang="x-default" href="{SITE}{path("en", p["slug"])}" />'
    langs = "".join(
        f'<a href="{path(l, p["slug"])}" hreflang="{l}" lang="{l}"{" aria-current=\"true\"" if l == lang else ""}>{LANG_NAME[l]}</a>' for l in LANGS
    )
    sections = []
    for i, (h2, paras, shot) in enumerate(p["sections"]):
        fig = f'<figure class="shot">{img_tag(shot[0], shot[1], lang)}<figcaption>{e(shot[1])}</figcaption></figure>' if shot else ""
        body = "".join(f"<p>{e(x)}</p>" for x in paras)
        sections.append(f'<section class="feature{" flip" if i % 2 else ""}{"" if shot else " solo"}"><div><h2>{e(h2)}</h2>{body}</div>{fig}</section>')
    steps = "".join(f"<li>{e(s)}</li>" for s in p["steps"])
    faq = "".join(f"<details><summary>{e(q)}</summary><p>{e(a)}</p></details>" for q, a in p["faq"])
    related = "".join(
        f'<li><a href="{path(lang, r)}">{e(by_slug[r]["h1"])}</a><span>{e(by_slug[r]["desc"].split(". ")[0])}.</span></li>' for r in p["related"]
    )
    allnav = "".join(f'<a href="{path(lang, q["slug"])}"{" aria-current=\"page\"" if q is p else ""}>{e(q["nav"])}</a>' for q in pages)
    legal = "" if lang == "en" else f"?lang={lang}"
    hero_img_name = p["hero"][0] + ("" if lang == "en" else f"-{lang}")
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "WebPage", "@id": url, "url": url, "name": p["title"], "description": p["desc"], "inLanguage": lang,
             "isPartOf": {"@id": f"{SITE}/#website"}, "about": {"@id": f"{SITE}/#app"},
             "primaryImageOfPage": f"{SITE}/img/{hero_img_name}.webp"},
            {"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "THE REMIXITY", "item": f"{SITE}/"},
                {"@type": "ListItem", "position": 2, "name": p["nav"], "item": url}]},
            {"@type": "FAQPage", "mainEntity": [
                {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in p["faq"]]},
        ],
    }
    hero_img = img_tag(p["hero"][0], p["hero"][1], lang, eager=True)
    return f"""<!doctype html>
<html lang="{lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#120c1f" />
    <title>{e(p["title"])}</title>
    <meta name="description" content="{e(p["desc"])}" />
    <link rel="canonical" href="{url}" />{alternates}
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon-48.png" type="image/png" sizes="48x48" />
    <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="THE REMIXITY" />
    <meta property="og:locale" content="{LOCALE[lang]}" />
    <meta property="og:url" content="{url}" />
    <meta property="og:title" content="{e(p["title"])}" />
    <meta property="og:description" content="{e(p["desc"])}" />
    <meta property="og:image" content="{SITE}/img/og.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="{SITE}/img/og.jpg" />
    <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
    <style>
      :root {{ color-scheme: dark; --dim: rgba(255,255,255,.66); --line: rgba(255,255,255,.12); }}
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0; color: #fff; -webkit-text-size-adjust: 100%;
        font: 400 1.0625rem/1.65 system-ui, -apple-system, "Segoe UI", sans-serif;
        background: radial-gradient(70% 45% at 15% 0%, #4a2a8a, transparent 70%), radial-gradient(60% 40% at 95% 8%, #2a3f9a, transparent 70%),
          radial-gradient(60% 40% at 50% 100%, #5a1e46, transparent 70%), #120c1f;
        background-attachment: fixed;
      }}
      a {{ color: #fff; text-underline-offset: 3px; }}
      .wrap {{ max-width: 1080px; margin: 0 auto; padding: 0 20px; }}
      header {{ display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: max(16px, env(safe-area-inset-top)) 0 8px; }}
      .brand {{ color: #fff; text-decoration: none; font-size: .82rem; letter-spacing: .32em; font-weight: 300; white-space: nowrap; }}
      .brand b {{ font-weight: 800; }}
      .cta {{ display: inline-block; background: #fff; color: #120c1f; text-decoration: none; font-weight: 750; border-radius: 999px; padding: 12px 22px; }}
      .cta.small {{ padding: 9px 16px; font-size: .92rem; }}
      .hero {{ display: grid; gap: 28px; align-items: center; padding: 36px 0 24px; }}
      h1 {{ font-size: clamp(2.1rem, 6vw, 3.4rem); line-height: 1.05; letter-spacing: -.035em; margin: 0 0 16px; }}
      .lead {{ font-size: 1.15rem; color: rgba(255,255,255,.85); margin: 0 0 24px; max-width: 34em; }}
      .note {{ color: var(--dim); font-size: .92rem; margin: 12px 0 0; }}
      img {{ display: block; width: 100%; height: auto; border-radius: 26px; box-shadow: 0 24px 60px rgba(0,0,0,.45); }}
      .hero img, .shot img {{ max-width: 320px; margin: 0 auto; }}
      .story .hero img, .story .shot img {{ max-width: 300px; border-radius: 22px; }}
      figure {{ margin: 0; }}
      figcaption {{ color: var(--dim); font-size: .86rem; text-align: center; margin-top: 10px; }}
      h2 {{ font-size: clamp(1.4rem, 3.4vw, 1.9rem); letter-spacing: -.02em; line-height: 1.15; margin: 0 0 10px; }}
      p {{ margin: 0 0 12px; color: rgba(255,255,255,.84); }}
      .feature {{ display: grid; gap: 22px; align-items: center; padding: 34px 0; border-top: 1px solid var(--line); }}
      .card {{ background: rgba(255,255,255,.05); border: 1px solid var(--line); border-radius: 22px; padding: 22px; margin: 26px 0; }}
      ol {{ margin: 0; padding-left: 1.3em; }} li {{ margin: 6px 0; }}
      details {{ border-top: 1px solid var(--line); padding: 12px 0; }} details:first-of-type {{ border-top: 0; }}
      summary {{ cursor: pointer; font-weight: 650; }} details p {{ margin: 8px 0 0; }}
      .related ul {{ list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }}
      .related a {{ font-weight: 700; display: block; }} .related span {{ color: var(--dim); font-size: .95rem; }}
      footer {{ border-top: 1px solid var(--line); margin-top: 30px; padding: 22px 0 40px; color: var(--dim); font-size: .92rem; }}
      footer nav {{ display: flex; flex-wrap: wrap; gap: 8px 18px; margin-bottom: 14px; }}
      footer a {{ color: rgba(255,255,255,.85); }} footer a[aria-current] {{ color: #fff; font-weight: 700; }}
      .langs {{ display: flex; gap: 4px; }} .langs a {{ font-size: .8rem; font-weight: 650; text-decoration: none; padding: 6px 9px; border-radius: 999px; border: 1px solid var(--line); color: rgba(255,255,255,.8); }}
      .langs a[aria-current] {{ background: #fff; color: #120c1f; border-color: #fff; }}
      .top {{ display: flex; align-items: center; gap: 10px; }}
      @media (max-width: 560px) {{ header .cta.small {{ display: none; }} }} /* the big button is right below */
      @media (min-width: 820px) {{
        .hero {{ grid-template-columns: 1.15fr .85fr; padding-top: 56px; }}
        .feature {{ grid-template-columns: 1fr 1fr; gap: 56px; }}
        .feature.flip > div {{ order: 2; }}
        .feature.solo {{ grid-template-columns: 1fr; max-width: 46em; }}
      }}
    </style>
  </head>
  <body class="{"story" if p.get("story") else ""}">
    <div class="wrap">
      <header>
        <a class="brand" href="{app}">THE <b>REMIXITY</b></a>
        <div class="top">
          <nav class="langs" aria-label="{e(ui["language"])}">{langs}</nav>
          <a class="cta small" href="{app}">{e(ui["open"])}</a>
        </div>
      </header>
      <main>
        <section class="hero">
          <div>
            <h1>{e(p["h1"])}</h1>
            <p class="lead">{e(p["lead"])}</p>
            <a class="cta" href="{app}">{e(ui["cta"])}</a>
            <p class="note">{e(ui["note"])}</p>
          </div>
          <figure>{hero_img}<figcaption>{e(p["hero"][1])}</figcaption></figure>
        </section>
        {"".join(sections)}
        <section class="card">
          <h2>{e(ui["how"])}</h2>
          <ol>{steps}</ol>
          <p class="note" style="margin-top:16px"><a class="cta small" href="{app}">{e(ui["try"])}</a></p>
        </section>
        <section class="card">
          <h2>{e(ui["questions"])}</h2>
          {faq}
        </section>
        <section class="card related">
          <h2>{e(ui["more"])}</h2>
          <ul>{related}</ul>
        </section>
      </main>
      <footer>
        <nav aria-label="{e(ui["features"])}"><a href="{app}">THE REMIXITY</a>{allnav}</nav>
        <p><a href="/privacy{legal}">{e(ui["privacy"])}</a> · <a href="/terms{legal}">{e(ui["terms"])}</a> · {e(ui["made"])} <a href="https://instagram.com/iliyabarcari" target="_blank" rel="noopener">@iliyabarcari</a></p>
      </footer>
    </div>
  </body>
</html>
"""


count = 0
for lang, pages in LANGS.items():
    for p in pages:
        out = "public" + path(lang, p["slug"]) + "index.html"
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, "w", encoding="utf-8").write(page(lang, p))
        count += 1

# Sitemap: every page, with its language versions (hreflang) for the feature pages.
def entry(loc, pr, alts=None):
    links = "".join(f'\n    <xhtml:link rel="alternate" hreflang="{l}" href="{h}" />' for l, h in (alts or []))
    return f"  <url>\n    <loc>{loc}</loc>\n    <lastmod>{TODAY}</lastmod>\n    <priority>{pr}</priority>{links}\n  </url>\n"

items = [entry(f"{SITE}/", "1.0")]
for p in EN:
    alts = [(l, SITE + path(l, p["slug"])) for l in LANGS] + [("x-default", SITE + path("en", p["slug"]))]
    for l in LANGS:
        items.append(entry(SITE + path(l, p["slug"]), "0.8" if l == "en" else "0.7", alts))
items += [entry(f"{SITE}/privacy", "0.2"), entry(f"{SITE}/terms", "0.2")]
sitemap = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
           + "".join(items) + "</urlset>\n")
open("public/sitemap.xml", "w", encoding="utf-8").write(sitemap)
print(f"ok: {count} pages + sitemap ({len(items)} URLs)")
