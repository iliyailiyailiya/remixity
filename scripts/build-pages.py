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

PAGES = [
  {
    "slug": "slow-reverb",
    "nav": "Slowed + reverb",
    "title": "Slowed + Reverb Online: Free, No Download · THE REMIXITY",
    "desc": "Make slowed + reverb songs online for free. Slide one pedal to slow a song down, the reverb follows, then export MP3 320 or WAV. Nothing is uploaded.",
    "h1": "Make slowed + reverb songs online",
    "lead": "Pick a song from your phone or computer, slide the pedal down, and THE REMIXITY slows it and adds the reverb for you. No app to install, no account, and your music never leaves your device.",
    "hero": ("app-pedal", "The pedal in THE REMIXITY: the song slowed to ×0.85 at 119 BPM"),
    "sections": [
      ("One pedal does it", [
        "Slide the pedal down to slow the song, up to speed it up, from half speed (×0.5) to one and a half (×1.5). The BPM updates as you go, so you can aim for a tempo rather than a number.",
        "The reverb follows the pedal: the slower the song, the bigger and darker the room it plays in. That's the classic slowed + reverb sound, without touching a single slider. Want to set it yourself? Open the reverb page and change the size, tone and amount.",
      ], ("app-space", "Reverb and echo settings, with the echo synced to the beat")),
      ("Slow down without lowering the pitch", [
        "Classic slowed songs drop in pitch, like a record spinning slower. If you want the song slower but in the same key, turn on Keep pitch: the speed changes, the voice stays where it was.",
      ], None),
      ("Nightcore works the same way", [
        "Push the pedal up past ×1.25 and you get nightcore: faster, brighter and higher. The same pedal, the same export.",
      ], None),
      ("Export the result", [
        "Save your remix as MP3 320 kbps, or as WAV in 16 or 24 bit. Rename the file and set the title, artist and cover that music players will show. You can also share it straight from your phone.",
      ], ("app-export", "Export options: MP3 320 or WAV, with title, artist and cover")),
    ],
    "steps": [
      "Open THE REMIXITY and choose a song (MP3, WAV, FLAC, M4A, AAC, OGG, Opus or AIFF).",
      "Slide the pedal down until it sounds right. The reverb comes with it.",
      "Tap the download button and save it as MP3 or WAV.",
    ],
    "faq": [
      ("Is it free?", "Yes. There's no account and no watermark on your audio."),
      ("Is my song uploaded anywhere?", "No. The song is decoded, processed and exported on your device. Only if you choose to share it does it go anywhere."),
      ("Does it work on iPhone?", "Yes, in Safari. You can also add it to your home screen and use it like an app, with the lock screen controls."),
      ("How do I slow down a song without downloading software?", "Open remixity.app in your browser, choose the song and slide the pedal. Everything happens in the page."),
    ],
    "related": ["audio-editor", "instagram-story-maker", "music-library"],
  },
  {
    "slug": "audio-editor",
    "nav": "Audio editor",
    "title": "Online Audio Editor for Songs: Speed, Reverb, EQ, Trim · THE REMIXITY",
    "desc": "Edit songs online: change the speed with or without the pitch, add reverb and echo, shape the sound with a 5-band EQ, trim and cut parts, then export MP3 or WAV.",
    "h1": "An online music editor that runs in your browser",
    "lead": "THE REMIXITY is made for editing songs, not podcasts. Change the speed and pitch, add reverb to an MP3, shape it with an EQ, cut out the parts you don't want and export a clean file. All of it happens on your device.",
    "hero": ("app-eq", "The 5-band equalizer, with the song's spectrum behind it"),
    "sections": [
      ("Speed and pitch", [
        "Speed up or slow down from ×0.5 to ×1.5. By default the pitch moves with the speed, like a record; with Keep pitch on, a time-stretch keeps the song in its key. The tempo (BPM) is detected for you and follows every change.",
      ], ("app-pedal", "The pedal with the BPM and Keep pitch")),
      ("Reverb and echo", [
        "Add reverb to an MP3 or any other song: choose how big the room is, how dark it sounds and how much of it you hear. The echo can lock to the song's tempo (quarter, eighth, dotted eighth or sixteenth notes) or be set freely.",
      ], ("app-space", "Reverb and echo, with the echo locked to the tempo")),
      ("A 5-band EQ you can see", [
        "Drag the points to boost or cut the bass, low mids, mids, highs and air, over a live picture of the music's frequencies.",
      ], None),
      ("Trim, cut and loop", [
        "The Chop page shows the song as a waveform. Select a part to keep only it, cut it out, drop markers, loop a section while you listen, and undo anything.",
      ], ("app-chop", "The waveform editor: trim, cut, loop and undo")),
      ("Clean exports", [
        "Export as MP3 320 kbps or WAV (16 or 24 bit) with a look-ahead limiter so nothing clips. Set the file name, title, artist and cover art before saving.",
      ], ("app-export", "Export as MP3 or WAV with tags")),
    ],
    "steps": [
      "Choose a song; nothing is uploaded.",
      "Swipe through the pages: speed, reverb and echo, EQ, chop.",
      "Export as MP3 or WAV, or share it from your phone.",
    ],
    "faq": [
      ("Can I add reverb to an MP3 online for free?", "Yes. Open the song, go to the reverb page and set the amount. Export as MP3 when you're done."),
      ("Which file types can I edit?", "MP3, WAV, FLAC, M4A, AAC, OGG, Opus and AIFF, as far as your browser can decode them (most can)."),
      ("Will the quality drop?", "The audio is processed in 32-bit float and exported as MP3 320 kbps or lossless WAV."),
    ],
    "related": ["slow-reverb", "music-library", "music-card-maker"],
  },
  {
    "slug": "music-library",
    "nav": "Music library & lyrics",
    "title": "Music Player with Synced Lyrics and a Library, in Your Browser · THE REMIXITY",
    "desc": "Keep your own music in a library on your device: artists, playlists and a real player, with synced lyrics that follow the song. Fix names and missing covers in one go.",
    "h1": "A music player with synced lyrics for your own files",
    "lead": "Add your songs or a whole folder and THE REMIXITY becomes your music player: artists, playlists and a queue, with lyrics that light up line by line as the song plays. Your library stays in your browser, on your device.",
    "hero": ("app-lyrics-full", "Full-screen synced lyrics: the line being sung is highlighted"),
    "sections": [
      ("Lyrics that follow the music", [
        "For songs with timed lyrics, the line being sung lights up and the rest scroll by on their own. Tap the lyrics for a full-screen view, and tap any line to jump to it. They stay in sync even when you slow the song down or speed it up.",
        "Lyrics come from LRCLIB, an open lyrics database, and are only shown while the song is loaded.",
      ], ("app-lyrics", "The lyrics page in the player")),
      ("Your library, your device", [
        "Add songs from Files or a whole folder. They're stored in your browser on this device, sorted into songs, artists (with artist photos) and playlists you make. Play, shuffle, play next, and the queue moves on to the next song by itself.",
      ], ("app-library", "The library: songs with their covers")),
      ("Fix messy names and covers", [
        "Downloaded files often have names like “Artist - Song (Official Video) 320kbps”. Fix my library looks every song up in public music catalogues, proposes the right title, artist and cover, and changes nothing until you approve the list.",
        "Then save cleaned copies, with the new names, tags and covers, back to your Files.",
      ], ("app-artists", "Artists in the library")),
      ("Works like an app", [
        "Add THE REMIXITY to your home screen. Music keeps playing with the screen locked, and the lock screen and headphone buttons work: play, pause, next and previous.",
      ], None),
    ],
    "steps": [
      "Open your library and add songs or a folder.",
      "Play a song and swipe to the lyrics page.",
      "Run Fix my library to tidy up names and covers.",
    ],
    "faq": [
      ("Are my songs uploaded?", "No. The library lives in your browser's storage on your device. Keep your original files too: browsers can clear website data."),
      ("Where do the lyrics come from?", "From LRCLIB, an open, community-made lyrics database. Only the artist and title are used to look them up."),
      ("Can I use it on a computer?", "Yes, in Chrome, Edge, Safari or Firefox. In Chrome and Edge on a computer you can even rewrite the original files in your music folder with the cleaned names, tags and covers."),
    ],
    "related": ["instagram-story-maker", "slow-reverb", "audio-editor"],
  },
  {
    "slug": "instagram-story-maker",
    "nav": "Instagram Story maker",
    "title": "Instagram Story Maker for Music: Your Song, Lyrics and Cover · THE REMIXITY",
    "desc": "Turn a song into an Instagram Story: a video with your remix playing, animated synced lyrics, a spinning vinyl or moving waves. 1080×1920, made on your phone.",
    "h1": "Make Instagram Stories from your music",
    "lead": "Share what you're listening to as a real video: your remix plays (slowed, sped up or with reverb, exactly as you made it) while the lyrics follow along, a record spins or bars move with the beat. It's made on your phone in seconds.",
    "hero": ("story-lyrics", "A lyrics Story: the line being sung lights up"),
    "story": True,
    "sections": [
      ("Five looks", [
        "Cover puts the artwork in a clean card. Lyrics shows the words line by line in time with the music. Vinyl turns your cover into the label of a spinning record, slower when the song is slowed. Full cover fills the screen with the artwork. Waves adds bars that move with the actual audio.",
      ], ("story-vinyl", "A Vinyl Story: the cover is the label of a spinning record")),
      ("Your remix, your speed", [
        "The video carries a 15 or 30 second clip of the song exactly as you hear it in THE REMIXITY: the speed, the reverb, the EQ. Choose where in the song it starts.",
      ], ("story-waves", "A Waves Story with the sung line as a subtitle")),
      ("Make it yours", [
        "Pick the background (the blurred cover, its colours or dark), show the sung line as a subtitle under any design, and show or hide the speed badge. The preview updates as you go.",
      ], ("app-story-sheet", "The Story maker in the app")),
      ("Sharp and ready to post", [
        "Videos are 1080×1920 H.264 MP4 with AAC sound, the format Instagram expects. When it's ready, tap Share, pick Instagram, then Story.",
      ], None),
    ],
    "steps": [
      "Play a song in THE REMIXITY and open the download sheet.",
      "Tap Make a story, pick a look and Video 15 s or 30 s.",
      "Tap Create, then Share → Instagram → Story.",
    ],
    "faq": [
      ("How do I put a song with lyrics in my Instagram Story?", "Choose the Lyrics look (or turn on the lyrics line under any look). The words follow the music in the video. It works for songs that have timed lyrics."),
      ("Can I post a slowed or sped-up version?", "Yes. The Story uses your remix exactly as you set it, and the record and waves follow its speed."),
      ("Does it upload my music?", "No. The video is made on your device; it only goes where you share it."),
    ],
    "related": ["music-card-maker", "music-library", "slow-reverb"],
  },
  {
    "slug": "music-card-maker",
    "nav": "Music card maker",
    "title": "Music Card Maker: Now-Playing Cards for Your Songs · THE REMIXITY",
    "desc": "Create a music card for any song: the cover, title, artist and your remix's speed in a clean design. Story-sized PNG images to share anywhere, free.",
    "h1": "Make music cards for your favourite songs",
    "lead": "A music card is a still image of what you're listening to: the cover, the title and artist, and, if you remixed it, the speed. Make one in a second and share it in a Story, a post or a chat.",
    "hero": ("story-card", "A music card: the cover, title, artist and speed"),
    "story": True,
    "sections": [
      ("Pick a design", [
        "The classic white card, the full-screen cover, a vinyl record, the lyrics of the moment, or the cover with waves. Every design is made from the song's own artwork and colours.",
      ], ("story-full", "The full-cover design with the lyric line")),
      ("Capture a moment", [
        "Choose the moment in the song: with the lyrics line on, the card shows the words sung right then. Pick the background and decide whether to show the speed badge.",
      ], ("story-vinyl", "The vinyl design")),
      ("No cover? It finds one", [
        "Songs without artwork get one: THE REMIXITY looks the cover up in public catalogues, or makes a clean generated one with the title.",
      ], None),
      ("Ready to share", [
        "Cards are PNG images at 1080×1920, the size of a Story, saved to your phone or shared straight from the app.",
      ], None),
    ],
    "steps": [
      "Play a song in THE REMIXITY and open the download sheet.",
      "Tap Make a story and keep Image selected.",
      "Pick a look, tap Create, then Share.",
    ],
    "faq": [
      ("Is it free?", "Yes, with no watermark beyond the small THE REMIXITY line."),
      ("What size are the cards?", "1080×1920 pixels (PNG), the size of an Instagram or WhatsApp Story."),
      ("Can I make a video instead?", "Yes: choose Video 15 s or 30 s for an animated Story with the song playing."),
    ],
    "related": ["instagram-story-maker", "music-library", "audio-editor"],
  },
]

BY_SLUG = {p["slug"]: p for p in PAGES}
e = html.escape


def img_tag(name, alt, eager=False):
    w, h = STORY_IMG if name.startswith("story-") else APP_IMG
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    srcset = f'/img/{name}-sm.webp {w // 2}w, /img/{name}.webp {w}w'
    return (f'<img src="/img/{name}.webp" srcset="{srcset}" sizes="(min-width: 820px) 320px, 78vw" '
            f'width="{w}" height="{h}" alt="{e(alt)}" {load} decoding="async" />')


def page(p):
    url = f"{SITE}/{p['slug']}/"
    sections = []
    for i, (h2, paras, shot) in enumerate(p["sections"]):
        fig = f'<figure class="shot">{img_tag(shot[0], shot[1])}<figcaption>{e(shot[1])}</figcaption></figure>' if shot else ""
        body = "".join(f"<p>{e(x)}</p>" for x in paras)
        sections.append(f'<section class="feature{" flip" if i % 2 else ""}{"" if shot else " solo"}"><div><h2>{e(h2)}</h2>{body}</div>{fig}</section>')
    steps = "".join(f"<li>{e(s)}</li>" for s in p["steps"])
    faq = "".join(f"<details><summary>{e(q)}</summary><p>{e(a)}</p></details>" for q, a in p["faq"])
    related = "".join(
        f'<li><a href="/{r}/">{e(BY_SLUG[r]["h1"])}</a><span>{e(BY_SLUG[r]["desc"].split(". ")[0])}.</span></li>' for r in p["related"]
    )
    allnav = "".join(f'<a href="/{q["slug"]}/"{" aria-current=\"page\"" if q is p else ""}>{e(q["nav"])}</a>' for q in PAGES)
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "WebPage", "@id": url, "url": url, "name": p["title"], "description": p["desc"], "inLanguage": "en",
             "isPartOf": {"@id": f"{SITE}/#website"}, "about": {"@id": f"{SITE}/#app"},
             "primaryImageOfPage": f"{SITE}/img/{p['hero'][0]}.webp"},
            {"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "THE REMIXITY", "item": f"{SITE}/"},
                {"@type": "ListItem", "position": 2, "name": p["nav"], "item": url}]},
            {"@type": "FAQPage", "mainEntity": [
                {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in p["faq"]]},
        ],
    }
    hero_img = img_tag(p["hero"][0], p["hero"][1], eager=True)
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#120c1f" />
    <title>{e(p["title"])}</title>
    <meta name="description" content="{e(p["desc"])}" />
    <link rel="canonical" href="{url}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="THE REMIXITY" />
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
        <a class="brand" href="/">THE <b>REMIXITY</b></a>
        <a class="cta small" href="/">Open the app</a>
      </header>
      <main>
        <section class="hero">
          <div>
            <h1>{e(p["h1"])}</h1>
            <p class="lead">{e(p["lead"])}</p>
            <a class="cta" href="/">Open THE REMIXITY, free</a>
            <p class="note">Works in your browser on iPhone, Android and computers. Nothing to install, nothing uploaded.</p>
          </div>
          <figure>{hero_img}<figcaption>{e(p["hero"][1])}</figcaption></figure>
        </section>
        {"".join(sections)}
        <section class="card">
          <h2>How to do it</h2>
          <ol>{steps}</ol>
          <p class="note" style="margin-top:16px"><a class="cta small" href="/">Try it now</a></p>
        </section>
        <section class="card">
          <h2>Questions</h2>
          {faq}
        </section>
        <section class="card related">
          <h2>More you can do with THE REMIXITY</h2>
          <ul>{related}</ul>
        </section>
      </main>
      <footer>
        <nav aria-label="Features"><a href="/">THE REMIXITY</a>{allnav}</nav>
        <p><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · Made by <a href="https://instagram.com/iliyabarcari" target="_blank" rel="noopener">@iliyabarcari</a></p>
      </footer>
    </div>
  </body>
</html>
"""


import os
for p in PAGES:
    os.makedirs(f"public/{p['slug']}", exist_ok=True)
    open(f"public/{p['slug']}/index.html", "w", encoding="utf-8").write(page(p))

urls = [("", "1.0")] + [(f"{p['slug']}/", "0.8") for p in PAGES] + [("privacy", "0.2"), ("terms", "0.2")]
sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(
    f"  <url><loc>{SITE}/{u}</loc><lastmod>{TODAY}</lastmod><priority>{pr}</priority></url>\n" for u, pr in urls
) + "</urlset>\n"
open("public/sitemap.xml", "w", encoding="utf-8").write(sitemap)
print(f"ok: {len(PAGES)} pages + sitemap ({len(urls)} URLs)")
