#!/usr/bin/env python3
"""Builds public/privacy.html and public/terms.html (EN/RO/RU).

    python3 scripts/build-legal.py          # current site: no ads
    python3 scripts/build-legal.py --ads    # once the AdSense banner is live
"""
import sys
ADS = "--ads" in sys.argv
import html
UPDATED = {"en": "Last updated: 22 November 2026", "ro": "Ultima actualizare: 22 noiembrie 2026", "ru": "Обновлено: 22 ноября 2026"}
BACK = {"en": "Back to THE REMIXITY", "ro": "Înapoi la THE REMIXITY", "ru": "Назад в THE REMIXITY"}

PRIVACY = {
"en": ("Privacy", [
 ("The short version", ["THE REMIXITY runs in your browser. The songs you load are decoded, edited and exported on your device. They are never uploaded to our server, and we never store them."]),
 ("What stays on your device", ["Your language, saved presets and whether you've seen the swipe hint are kept in your browser's local storage. They never leave your device and you can clear them in your browser settings.", ("We don't use analytics. The only cookies come from the ad on the home screen, and only as described below." if ADS else "We don't use cookies, analytics or ads.")]),
 *([("Ads on the home screen", ["The home screen shows one ad from Google AdSense. It never appears in the player and never covers any controls.", "Google may use cookies to show and measure ads. Visitors in the EU, UK and Switzerland are asked for consent first, through Google's consent message, and can change their choice at any time. Without consent, Google shows limited, non-personalised ads.", "Ads never receive your audio or anything you do in the player. See how Google uses data: https://policies.google.com/technologies/partner-sites"])] if ADS else []),
 ("Missing covers", ["If a song has no cover art, THE REMIXITY can look it up in Apple's iTunes catalogue. Only the artist and title are sent to Apple's search service, never the audio. Apple's privacy policy applies to that request. You can turn this off in the ⋯ menu under Cover."]),
 ("Hosting", ["The site is hosted on Cloudflare Pages. Like any web host, Cloudflare may keep standard request logs (such as IP address and browser type) for security and reliability. Your audio is never part of those requests."]),
 ("Sharing to SoundCloud (optional)", [
   "Nothing is sent to SoundCloud unless you press “Share to SoundCloud”, connect your account and confirm the post.",
   "You sign in on SoundCloud's own page. SoundCloud then gives us a one-time code, which a small function on our server exchanges for an access token, because SoundCloud requires our app's secret for that step. That function never receives your audio and does not store or log the code or the token.",
   "The token is kept only in the browser tab you're using (session storage). It is deleted when you close the tab or press “Disconnect”, which also revokes our access at SoundCloud.",
   "When you post, the audio file, artwork, title, description, tags and privacy setting go directly from your browser to SoundCloud. They do not pass through or get stored on our server.",
   "While connected we read your SoundCloud username (to show who is connected) and your playlists (to find or create the “Remixity” playlist). We don't keep any of it.",
   "What you upload to SoundCloud is governed by SoundCloud's own terms and privacy policy."]),
 ("Sharing with your device's share sheet", ["“Share…” hands the exported file to your device's own share menu. We don't see where you send it."]),
]),
"ro": ("Confidențialitate", [
 ("Pe scurt", ["THE REMIXITY rulează în browserul tău. Piesele pe care le încarci sunt decodate, editate și exportate pe dispozitivul tău. Nu sunt niciodată încărcate pe serverul nostru și nu le păstrăm."]),
 ("Ce rămâne pe dispozitivul tău", ["Limba, presetările salvate și dacă ai văzut indiciul de glisare sunt păstrate în stocarea locală a browserului. Nu pleacă de pe dispozitiv și le poți șterge din setările browserului.", ("Nu folosim analiză de trafic. Singurele cookie-uri vin de la reclama de pe ecranul principal, doar cum e descris mai jos." if ADS else "Nu folosim cookie-uri, analiză de trafic sau reclame.")]),
 *([("Reclama de pe ecranul principal", ["Ecranul principal arată o reclamă Google AdSense. Nu apare niciodată în player și nu acoperă niciun buton.", "Google poate folosi cookie-uri ca să afișeze și să măsoare reclamele. Vizitatorii din UE, Regatul Unit și Elveția sunt întrebați mai întâi, prin mesajul de consimțământ Google, și își pot schimba oricând alegerea. Fără consimțământ, Google arată reclame limitate, nepersonalizate.", "Reclamele nu primesc niciodată audio-ul tău sau ce faci în player. Cum folosește Google datele: https://policies.google.com/technologies/partner-sites"])] if ADS else []),
 ("Coperte lipsă", ["Dacă o piesă nu are copertă, THE REMIXITY o poate căuta în catalogul iTunes al Apple. Se trimit doar artistul și titlul către serviciul de căutare Apple, niciodată audio-ul. Pentru această cerere se aplică politica de confidențialitate Apple. Poți dezactiva asta din meniul ⋯, la Copertă."]),
 ("Găzduire", ["Site-ul e găzduit pe Cloudflare Pages. Ca orice serviciu de găzduire, Cloudflare poate păstra jurnale standard ale cererilor (de exemplu adresa IP și tipul browserului) pentru securitate și fiabilitate. Audio-ul tău nu face niciodată parte din aceste cereri."]),
 ("Distribuirea pe SoundCloud (opțional)", [
   "Nimic nu e trimis la SoundCloud până nu apeși „Distribuie pe SoundCloud”, îți conectezi contul și confirmi publicarea.",
   "Te autentifici pe pagina SoundCloud. SoundCloud ne dă apoi un cod de unică folosință, pe care o mică funcție de pe serverul nostru îl schimbă pe un token de acces, pentru că SoundCloud cere secretul aplicației noastre la acest pas. Funcția nu primește niciodată audio-ul tău și nu păstrează și nu înregistrează codul sau tokenul.",
   "Tokenul e păstrat doar în fila de browser pe care o folosești (session storage). E șters când închizi fila sau apeși „Deconectează”, care ne revocă și accesul la SoundCloud.",
   "Când publici, fișierul audio, coperta, titlul, descrierea, etichetele și setarea de confidențialitate merg direct din browserul tău la SoundCloud. Nu trec prin serverul nostru și nu sunt păstrate acolo.",
   "Cât ești conectat, citim numele tău de utilizator SoundCloud (ca să arătăm cine e conectat) și playlisturile tale (ca să găsim sau să creăm playlistul „Remixity”). Nu păstrăm nimic din ele.",
   "Ce încarci pe SoundCloud e guvernat de termenii și politica de confidențialitate ale SoundCloud."]),
 ("Distribuirea prin meniul dispozitivului", ["„Distribuie…” trimite fișierul exportat către meniul de distribuire al dispozitivului tău. Nu vedem unde îl trimiți."]),
]),
"ru": ("Конфиденциальность", [
 ("Коротко", ["THE REMIXITY работает в твоём браузере. Треки, которые ты загружаешь, декодируются, редактируются и экспортируются на твоём устройстве. Они никогда не загружаются на наш сервер, и мы их не храним."]),
 ("Что остаётся на устройстве", ["Язык, сохранённые пресеты и то, видел ли ты подсказку про свайп, хранятся в локальном хранилище браузера. Они не покидают устройство, и их можно удалить в настройках браузера.", ("Мы не используем аналитику. Единственные cookie — от рекламы на главном экране, и только так, как описано ниже." if ADS else "Мы не используем cookie, аналитику или рекламу.")]),
 *([("Реклама на главном экране", ["На главном экране показывается одна реклама Google AdSense. Она никогда не появляется в плеере и не закрывает кнопки.", "Google может использовать cookie, чтобы показывать и измерять рекламу. Посетителей из ЕС, Великобритании и Швейцарии сначала спрашивают согласие через сообщение Google, и выбор можно изменить в любой момент. Без согласия Google показывает ограниченную, неперсонализированную рекламу.", "Реклама никогда не получает твоё аудио и не видит, что ты делаешь в плеере. Как Google использует данные: https://policies.google.com/technologies/partner-sites"])] if ADS else []),
 ("Недостающие обложки", ["Если у трека нет обложки, THE REMIXITY может найти её в каталоге iTunes от Apple. В поиск Apple отправляются только исполнитель и название, никогда не аудио. На этот запрос распространяется политика конфиденциальности Apple. Это можно отключить в меню ⋯, в разделе «Обложка»."]),
 ("Хостинг", ["Сайт размещён на Cloudflare Pages. Как и любой хостинг, Cloudflare может хранить стандартные журналы запросов (например, IP-адрес и тип браузера) для безопасности и надёжности. Твоё аудио никогда не входит в эти запросы."]),
 ("Публикация на SoundCloud (по желанию)", [
   "Ничего не отправляется в SoundCloud, пока ты не нажмёшь «Выложить на SoundCloud», не подключишь аккаунт и не подтвердишь публикацию.",
   "Ты входишь на странице самого SoundCloud. SoundCloud выдаёт нам одноразовый код, который небольшая функция на нашем сервере обменивает на токен доступа: для этого шага SoundCloud требует секретный ключ нашего приложения. Эта функция никогда не получает твоё аудио и не хранит и не записывает ни код, ни токен.",
   "Токен хранится только во вкладке браузера, которой ты пользуешься (session storage). Он удаляется, когда ты закрываешь вкладку или нажимаешь «Отключить», что также отзывает наш доступ в SoundCloud.",
   "При публикации аудиофайл, обложка, название, описание, теги и настройка приватности идут напрямую из твоего браузера в SoundCloud. Они не проходят через наш сервер и не хранятся на нём.",
   "Пока аккаунт подключён, мы читаем твоё имя пользователя SoundCloud (чтобы показать, кто подключён) и твои плейлисты (чтобы найти или создать плейлист «Remixity»). Мы ничего из этого не сохраняем.",
   "То, что ты загружаешь в SoundCloud, регулируется условиями и политикой конфиденциальности SoundCloud."]),
 ("Меню «Поделиться» устройства", ["«Поделиться…» передаёт экспортированный файл в системное меню твоего устройства. Мы не видим, куда ты его отправляешь."]),
]),
}

TERMS = {
"en": ("Terms", [
 ("Using THE REMIXITY", ["THE REMIXITY is a free tool. Everything runs in your browser. It is provided “as is”, without warranties of any kind, and we're not liable for any loss arising from its use."]),
 ("Your audio, your responsibility", ["You are responsible for the audio you load, export and share. Only share remixes of audio you have the rights to. A slowed, sped-up or reverb version of someone else's song is usually still their copyrighted work."]),
 ("Sharing to SoundCloud", [
   "Posting to SoundCloud only happens when you connect your own account and confirm the post. You choose the title, description, tags, artwork and whether it's private (the default) or public.",
   "Uploads are subject to SoundCloud's Terms of Use. SoundCloud may block or remove audio it finds infringing, and repeated problems can affect your SoundCloud account.",
   "THE REMIXITY is not affiliated with, sponsored or endorsed by SoundCloud. SoundCloud is a trademark of SoundCloud Global Limited & Co. KG.",
   "Don't use THE REMIXITY to post spam or to upload content in bulk or automatically."]),
 ("Changes", ["We may update these terms. The date at the top shows the latest version."]),
]),
"ro": ("Termeni", [
 ("Folosirea THE REMIXITY", ["THE REMIXITY e un instrument gratuit. Totul rulează în browserul tău. Este oferit „ca atare”, fără garanții de niciun fel, și nu răspundem pentru pierderi rezultate din folosirea lui."]),
 ("Audio-ul tău, responsabilitatea ta", ["Ești responsabil pentru audio-ul pe care îl încarci, exporți și distribui. Distribuie doar remixuri ale unor piese pentru care ai drepturi. O versiune încetinită, accelerată sau cu reverb a piesei altcuiva e de obicei tot opera lor protejată de drepturi de autor."]),
 ("Distribuirea pe SoundCloud", [
   "Publicarea pe SoundCloud are loc doar când îți conectezi propriul cont și confirmi publicarea. Tu alegi titlul, descrierea, etichetele, coperta și dacă e privată (implicit) sau publică.",
   "Încărcările sunt supuse Termenilor de utilizare SoundCloud. SoundCloud poate bloca sau șterge audio pe care îl consideră încălcare, iar problemele repetate îți pot afecta contul SoundCloud.",
   "THE REMIXITY nu e afiliat, sponsorizat sau susținut de SoundCloud. SoundCloud este o marcă a SoundCloud Global Limited & Co. KG.",
   "Nu folosi THE REMIXITY pentru spam sau pentru încărcări în masă ori automate."]),
 ("Modificări", ["Putem actualiza acești termeni. Data de sus arată ultima versiune."]),
]),
"ru": ("Условия", [
 ("Использование THE REMIXITY", ["THE REMIXITY — бесплатный инструмент. Всё работает в твоём браузере. Он предоставляется «как есть», без каких-либо гарантий, и мы не несём ответственности за потери, связанные с его использованием."]),
 ("Твоё аудио — твоя ответственность", ["Ты отвечаешь за аудио, которое загружаешь, экспортируешь и публикуешь. Публикуй только ремиксы аудио, на которое у тебя есть права. Замедленная, ускоренная или реверб-версия чужой песни обычно остаётся их произведением, защищённым авторским правом."]),
 ("Публикация на SoundCloud", [
   "Публикация на SoundCloud происходит, только когда ты подключаешь свой аккаунт и подтверждаешь её. Ты выбираешь название, описание, теги, обложку и делаешь трек приватным (по умолчанию) или публичным.",
   "Загрузки подчиняются Условиям использования SoundCloud. SoundCloud может заблокировать или удалить аудио, которое сочтёт нарушением, а повторные нарушения могут повлиять на твой аккаунт SoundCloud.",
   "THE REMIXITY не связан с SoundCloud и не спонсируется и не одобряется им. SoundCloud — товарный знак SoundCloud Global Limited & Co. KG.",
   "Не используй THE REMIXITY для спама и для массовых или автоматических загрузок."]),
 ("Изменения", ["Мы можем обновлять эти условия. Дата вверху показывает последнюю версию."]),
]),
}

def page(name, content, title_en):
    sections = []
    for lang in ("en", "ro", "ru"):
        title, parts = content[lang]
        body = "".join(f"<h2>{html.escape(h)}</h2>" + "".join(f"<p>{html.escape(p)}</p>" for p in ps) for h, ps in parts)
        sections.append(f'''    <article lang="{lang}" hidden>
      <h1>{html.escape(title)}</h1>
      <p class="date">{UPDATED[lang]}</p>
      {body}
      <p class="back"><a href="/">← {BACK[lang]}</a></p>
    </article>''')
    return f'''<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#120c1f" />
    <title>{title_en} · THE REMIXITY</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <style>
      :root {{ color-scheme: dark; }}
      body {{
        margin: 0;
        background: radial-gradient(70% 50% at 20% 0%, #4a2a8a, transparent 70%), radial-gradient(60% 50% at 90% 10%, #2a3f9a, transparent 70%), #120c1f;
        background-attachment: fixed;
        color: #fff;
        font: 400 1rem/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
        -webkit-text-size-adjust: 100%;
      }}
      main {{ max-width: 680px; margin: 0 auto; padding: max(20px, env(safe-area-inset-top)) 20px 48px; }}
      header {{ display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 28px; }}
      .brand {{ color: #fff; text-decoration: none; font-size: 0.8rem; letter-spacing: 0.32em; font-weight: 300; }}
      .brand b {{ font-weight: 800; }}
      nav {{ display: flex; gap: 4px; }}
      nav button {{ border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.08); color: #fff; border-radius: 999px; padding: 6px 12px; font: 600 0.8rem system-ui, sans-serif; cursor: pointer; }}
      nav button[aria-pressed="true"] {{ background: #fff; color: #120c1f; }}
      h1 {{ font-size: 2.2rem; letter-spacing: -0.03em; line-height: 1.1; margin: 0 0 6px; }}
      h2 {{ font-size: 1.1rem; margin: 28px 0 6px; }}
      p {{ margin: 0 0 12px; color: rgba(255,255,255,.82); }}
      .date {{ color: rgba(255,255,255,.55); font-size: .88rem; }}
      a {{ color: #fff; text-underline-offset: 3px; }}
      .back {{ margin-top: 36px; }}
      [hidden] {{ display: none !important; }}
    </style>
  </head>
  <body>
    <main>
      <header>
        <a class="brand" href="/">THE <b>REMIXITY</b></a>
        <nav aria-label="Language">
          <button data-lang="en">EN</button><button data-lang="ro">RO</button><button data-lang="ru">RU</button>
        </nav>
      </header>
{chr(10).join(sections)}
    </main>
    <script>
      (function () {{
        function pick() {{
          var q = new URLSearchParams(location.search).get('lang');
          if (q === 'en' || q === 'ro' || q === 'ru') return q;
          try {{ var s = localStorage.getItem('lang'); if (s === 'en' || s === 'ro' || s === 'ru') return s; }} catch (e) {{}}
          var n = (navigator.language || 'en').slice(0, 2).toLowerCase();
          return n === 'ro' || n === 'ru' ? n : 'en';
        }}
        function show(lang) {{
          document.documentElement.lang = lang;
          document.querySelectorAll('article').forEach(function (a) {{ a.hidden = a.lang !== lang; }});
          document.querySelectorAll('nav button').forEach(function (b) {{ b.setAttribute('aria-pressed', String(b.dataset.lang === lang)); }});
        }}
        document.querySelectorAll('nav button').forEach(function (b) {{
          b.addEventListener('click', function () {{
            show(b.dataset.lang);
            try {{ localStorage.setItem('lang', b.dataset.lang); }} catch (e) {{}}
          }});
        }});
        show(pick());
      }})();
    </script>
  </body>
</html>
'''
open('public/privacy.html','w',encoding='utf-8').write(page('privacy', PRIVACY, 'Privacy'))
open('public/terms.html','w',encoding='utf-8').write(page('terms', TERMS, 'Terms'))
print('ok')
