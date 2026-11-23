#!/usr/bin/env python3
"""Builds public/privacy.html and public/terms.html (EN/RO/RU).

    python3 scripts/build-legal.py             # the site with AdSense (current)
    python3 scripts/build-legal.py --no-ads    # if AdSense is ever removed
"""
import sys
ADS = "--no-ads" not in sys.argv
import html
UPDATED = {"en": "Last updated: 23 November 2026", "ro": "Ultima actualizare: 23 noiembrie 2026", "ru": "Обновлено: 23 ноября 2026"}
BACK = {"en": "Back to THE REMIXITY", "ro": "Înapoi la THE REMIXITY", "ru": "Назад в THE REMIXITY"}

PRIVACY = {
"en": ("Privacy", [
 ("The short version", ["THE REMIXITY runs in your browser. The songs you load are decoded, edited and exported on your device. They are never uploaded to our server, and we never store them."]),
 ("What stays on your device", ["Your library stays on your device: the songs you add, their names and covers, and your playlists are stored in your browser's own storage (IndexedDB). They are never uploaded. Deleting a song or playlist removes it, and clearing this site's data in your browser removes the whole library. Some browsers, Safari on iPhone included, may clear website storage on their own, so keep your original files somewhere safe.", "Your language, saved presets, settings, whether you've seen the swipe hint, and which artist photos were found are kept in your browser's local storage. They never leave your device and you can clear them in your browser settings.", "If you install THE REMIXITY on your home screen, your browser keeps a copy of the site's own files so it opens quickly. Your audio is never part of that copy.", ("We don't use analytics. The only cookies come from the ad on the home screen, and only as described below." if ADS else "We don't use cookies, analytics or ads.")]),
 *([("Ads on the home screen", ["The home screen shows one ad from Google AdSense. It never appears in the player and never covers any controls.", "Google may use cookies to show and measure ads. Visitors in the EU, UK and Switzerland are asked for consent first, through Google's consent message, and can change their choice at any time. Without consent, Google shows limited, non-personalised ads.", "Ads never receive your audio or anything you do in the player. See how Google uses data: https://policies.google.com/technologies/partner-sites"])] if ADS else []),
 ("Covers, song names and artist photos", ["If a song has no cover art, or when you ask it to (🔍 or “Fix my library”), THE REMIXITY can look it up in Apple's iTunes catalogue, Deezer's catalogue and the open MusicBrainz database (with artwork from the Cover Art Archive). Only the artist and title are sent, never the audio. Requests to Apple and MusicBrainz go straight from your browser when possible; requests to Deezer (and to Apple, if your browser can't reach it) go through a small relay on our server, which passes the name on and the cover back without storing or logging anything. Found covers load straight from the catalogue's image servers, or through the same relay (again without storing anything) if your browser can't reach them. “Fix my library” does the same lookup for each song in your library, one at a time, and changes nothing until you press Apply.", "The Artists tab shows artist photos from Deezer. For this, the artist's name (and sometimes one of their song titles) goes through the same relay, and the photo then loads from Deezer's image servers, which see your IP address like any website you load images from.", "These services' own privacy policies apply to those requests. You can turn all of this off in the ⋯ menu under Cover & lyrics."]),
 ("Saving files", ["Exports, “Save a copy” and “Save all” are made on your device and handed to your browser's download, share sheet or the folder you pick. On computers that support it, “Update original files” asks you to pick your music folder and only rewrites the matching songs in that folder. We never see any of these files."]),
 ("Lyrics", ["The Lyrics page looks the song up in LRCLIB (lrclib.net), an open, community-made lyrics database. Only the artist and title are sent, never the audio. The search goes through a small relay on our server, which keeps LRCLIB's answer in Cloudflare's cache (for up to 30 days) so the next person listening to the same song gets it from there instead of asking LRCLIB again. The cache holds the lyrics under the song's name, never who asked, and nothing is logged. If the relay can't be reached, your browser asks LRCLIB directly. On your device, lyrics are shown while the song is loaded and are never saved or added to your audio exports. They only end up in a file if you choose the Lyrics style when making a story, and that story is made on your device. You can turn this off in the ⋯ menu under Cover & lyrics."]),
 ("Hosting", ["The site is hosted on Cloudflare Pages. Like any web host, Cloudflare may keep standard request logs (such as IP address and browser type) for security and reliability. Your audio is never part of those requests."]),
 ("Sharing to SoundCloud (optional)", [
   "Nothing is sent to SoundCloud unless you press “Share to SoundCloud”, connect your account and confirm the post.",
   "You sign in on SoundCloud's own page. SoundCloud then gives us a one-time code, which a small function on our server exchanges for an access token, because SoundCloud requires our app's secret for that step. That function never receives your audio and does not store or log the code or the token.",
   "The token is kept only in the browser tab you're using (session storage). It is deleted when you close the tab or press “Disconnect”, which also revokes our access at SoundCloud.",
   "When you post, the audio file, artwork, title, description, tags and privacy setting go directly from your browser to SoundCloud. They do not pass through or get stored on our server.",
   "While connected we read your SoundCloud username (to show who is connected) and your playlists (to find or create the “Remixity” playlist). We don't keep any of it.",
   "What you upload to SoundCloud is governed by SoundCloud's own terms and privacy policy."]),
 ("Sharing with your device's share sheet", ["“Share…” hands the exported file to your device's own share menu. We don't see where you send it."]),
 ("Contact", ["THE REMIXITY is made by @iliyabarcari. Questions or requests about your data: message @iliyabarcari on Instagram."]),
]),
"ro": ("Confidențialitate", [
 ("Pe scurt", ["THE REMIXITY rulează în browserul tău. Piesele pe care le încarci sunt decodate, editate și exportate pe dispozitivul tău. Nu sunt niciodată încărcate pe serverul nostru și nu le păstrăm."]),
 ("Ce rămâne pe dispozitivul tău", ["Biblioteca ta rămâne pe dispozitiv: piesele pe care le adaugi, numele și copertele lor și playlisturile tale sunt păstrate în stocarea browserului (IndexedDB). Nu sunt încărcate niciodată. Ștergerea unei piese sau a unui playlist îl elimină, iar ștergerea datelor acestui site din browser elimină toată biblioteca. Unele browsere, inclusiv Safari pe iPhone, pot șterge singure datele site-urilor, așa că păstrează fișierele originale într-un loc sigur.", "Limba, presetările salvate, setările, dacă ai văzut indiciul de glisare și ce fotografii de artiști au fost găsite sunt păstrate în stocarea locală a browserului. Nu pleacă de pe dispozitiv și le poți șterge din setările browserului.", "Dacă instalezi THE REMIXITY pe ecranul principal, browserul păstrează o copie a fișierelor site-ului ca să se deschidă repede. Audio-ul tău nu face niciodată parte din această copie.", ("Nu folosim analiză de trafic. Singurele cookie-uri vin de la reclama de pe ecranul principal, doar cum e descris mai jos." if ADS else "Nu folosim cookie-uri, analiză de trafic sau reclame.")]),
 *([("Reclama de pe ecranul principal", ["Ecranul principal arată o reclamă Google AdSense. Nu apare niciodată în player și nu acoperă niciun buton.", "Google poate folosi cookie-uri ca să afișeze și să măsoare reclamele. Vizitatorii din UE, Regatul Unit și Elveția sunt întrebați mai întâi, prin mesajul de consimțământ Google, și își pot schimba oricând alegerea. Fără consimțământ, Google arată reclame limitate, nepersonalizate.", "Reclamele nu primesc niciodată audio-ul tău sau ce faci în player. Cum folosește Google datele: https://policies.google.com/technologies/partner-sites"])] if ADS else []),
 ("Coperte, nume de piese și fotografii de artiști", ["Dacă o piesă nu are copertă, sau când ceri tu (🔍 sau „Repară biblioteca”), THE REMIXITY o poate căuta în catalogul iTunes al Apple, în catalogul Deezer și în baza de date deschisă MusicBrainz (cu coperte din Cover Art Archive). Se trimit doar artistul și titlul, niciodată audio-ul. Cererile către Apple și MusicBrainz pleacă direct din browser când se poate; cererile către Deezer (și către Apple, dacă browserul nu ajunge la el) trec printr-un mic releu de pe serverul nostru, care trimite numele și aduce coperta înapoi, fără să păstreze sau să înregistreze ceva. Copertele găsite se încarcă direct de pe serverele de imagini ale catalogului sau, dacă browserul nu ajunge la ele, prin același releu (tot fără să se păstreze ceva). „Repară biblioteca” face aceeași căutare pentru fiecare piesă din bibliotecă, pe rând, și nu schimbă nimic până nu apeși Aplică.", "Fila Artiști arată fotografii de artiști de la Deezer. Pentru asta, numele artistului (și uneori titlul unei piese de-a lui) trece prin același releu, iar fotografia se încarcă apoi de pe serverele de imagini Deezer, care îți văd adresa IP ca orice site de pe care se încarcă imagini.", "Pentru aceste cereri se aplică politicile de confidențialitate ale acestor servicii. Poți dezactiva toate acestea din meniul ⋯, la Copertă și versuri."]),
 ("Salvarea fișierelor", ["Exporturile, „Salvează o copie” și „Salvează tot” sunt făcute pe dispozitivul tău și predate descărcărilor browserului, meniului de distribuire sau dosarului pe care îl alegi. Pe calculatoarele care permit asta, „Actualizează fișierele originale” îți cere să alegi dosarul cu muzică și rescrie doar piesele potrivite din acel dosar. Nu vedem niciodată aceste fișiere."]),
 ("Versuri", ["Pagina Versuri caută piesa în LRCLIB (lrclib.net), o bază de date deschisă de versuri, făcută de comunitate. Se trimit doar artistul și titlul, niciodată audio-ul. Căutarea trece printr-un mic releu de pe serverul nostru, care păstrează răspunsul LRCLIB în cache-ul Cloudflare (până la 30 de zile), ca următorul om care ascultă aceeași piesă să-l primească de acolo, fără a întreba din nou LRCLIB. Cache-ul ține versurile sub numele piesei, niciodată cine a întrebat, și nu se înregistrează nimic. Dacă releul nu răspunde, browserul întreabă direct LRCLIB. Pe dispozitivul tău, versurile apar cât timp piesa e încărcată și nu sunt niciodată salvate sau adăugate în exporturile audio. Ajung într-un fișier doar dacă alegi stilul Versuri când creezi un story, iar story-ul e făcut pe dispozitivul tău. Poți dezactiva asta din meniul ⋯, la Copertă și versuri."]),
 ("Găzduire", ["Site-ul e găzduit pe Cloudflare Pages. Ca orice serviciu de găzduire, Cloudflare poate păstra jurnale standard ale cererilor (de exemplu adresa IP și tipul browserului) pentru securitate și fiabilitate. Audio-ul tău nu face niciodată parte din aceste cereri."]),
 ("Distribuirea pe SoundCloud (opțional)", [
   "Nimic nu e trimis la SoundCloud până nu apeși „Distribuie pe SoundCloud”, îți conectezi contul și confirmi publicarea.",
   "Te autentifici pe pagina SoundCloud. SoundCloud ne dă apoi un cod de unică folosință, pe care o mică funcție de pe serverul nostru îl schimbă pe un token de acces, pentru că SoundCloud cere secretul aplicației noastre la acest pas. Funcția nu primește niciodată audio-ul tău și nu păstrează și nu înregistrează codul sau tokenul.",
   "Tokenul e păstrat doar în fila de browser pe care o folosești (session storage). E șters când închizi fila sau apeși „Deconectează”, care ne revocă și accesul la SoundCloud.",
   "Când publici, fișierul audio, coperta, titlul, descrierea, etichetele și setarea de confidențialitate merg direct din browserul tău la SoundCloud. Nu trec prin serverul nostru și nu sunt păstrate acolo.",
   "Cât ești conectat, citim numele tău de utilizator SoundCloud (ca să arătăm cine e conectat) și playlisturile tale (ca să găsim sau să creăm playlistul „Remixity”). Nu păstrăm nimic din ele.",
   "Ce încarci pe SoundCloud e guvernat de termenii și politica de confidențialitate ale SoundCloud."]),
 ("Distribuirea prin meniul dispozitivului", ["„Distribuie…” trimite fișierul exportat către meniul de distribuire al dispozitivului tău. Nu vedem unde îl trimiți."]),
 ("Contact", ["THE REMIXITY este făcut de @iliyabarcari. Întrebări sau cereri despre datele tale: scrie-i lui @iliyabarcari pe Instagram."]),
]),
"ru": ("Конфиденциальность", [
 ("Коротко", ["THE REMIXITY работает в твоём браузере. Треки, которые ты загружаешь, декодируются, редактируются и экспортируются на твоём устройстве. Они никогда не загружаются на наш сервер, и мы их не храним."]),
 ("Что остаётся на устройстве", ["Твоя медиатека остаётся на устройстве: добавленные треки, их названия и обложки, а также твои плейлисты хранятся в хранилище браузера (IndexedDB). Они никогда не загружаются на сервер. Удаление трека или плейлиста убирает его, а очистка данных этого сайта в браузере удаляет всю медиатеку. Некоторые браузеры, включая Safari на iPhone, могут сами очищать данные сайтов, поэтому храни оригинальные файлы в надёжном месте.", "Язык, сохранённые пресеты, настройки, то, видел ли ты подсказку про свайп, и какие фото исполнителей были найдены, хранятся в локальном хранилище браузера. Они не покидают устройство, и их можно удалить в настройках браузера.", "Если ты установишь THE REMIXITY на экран «Домой», браузер сохранит копию файлов самого сайта, чтобы он быстро открывался. Твоё аудио в эту копию никогда не входит.", ("Мы не используем аналитику. Единственные cookie — от рекламы на главном экране, и только так, как описано ниже." if ADS else "Мы не используем cookie, аналитику или рекламу.")]),
 *([("Реклама на главном экране", ["На главном экране показывается одна реклама Google AdSense. Она никогда не появляется в плеере и не закрывает кнопки.", "Google может использовать cookie, чтобы показывать и измерять рекламу. Посетителей из ЕС, Великобритании и Швейцарии сначала спрашивают согласие через сообщение Google, и выбор можно изменить в любой момент. Без согласия Google показывает ограниченную, неперсонализированную рекламу.", "Реклама никогда не получает твоё аудио и не видит, что ты делаешь в плеере. Как Google использует данные: https://policies.google.com/technologies/partner-sites"])] if ADS else []),
 ("Обложки, названия треков и фото исполнителей", ["Если у трека нет обложки или ты сам попросишь (🔍 или «Привести в порядок»), THE REMIXITY может найти её в каталоге iTunes от Apple, в каталоге Deezer и в открытой базе MusicBrainz (обложки из Cover Art Archive). Отправляются только исполнитель и название, никогда не аудио. Запросы к Apple и MusicBrainz по возможности идут прямо из браузера; запросы к Deezer (и к Apple, если браузер не может до него достучаться) идут через небольшой ретранслятор на нашем сервере: он передаёт название и возвращает обложку, ничего не сохраняя и не записывая. Найденные обложки загружаются прямо с серверов изображений каталога или, если браузер не может до них достучаться, через тот же ретранслятор (тоже без сохранения). «Привести в порядок» делает такой же поиск для каждого трека в медиатеке по очереди и ничего не меняет, пока ты не нажмёшь «Применить».", "Во вкладке «Артисты» показываются фото исполнителей из Deezer. Для этого имя исполнителя (а иногда и название одного его трека) идёт через тот же ретранслятор, а фото затем загружается с серверов изображений Deezer, которые видят твой IP-адрес, как любой сайт, с которого загружаются картинки.", "На эти запросы распространяются политики конфиденциальности этих сервисов. Всё это можно отключить в меню ⋯, в разделе «Обложка и текст»."]),
 ("Сохранение файлов", ["Экспорт, «Сохранить копию» и «Сохранить все» делаются на твоём устройстве и передаются в загрузки браузера, меню «Поделиться» или в выбранную тобой папку. На компьютерах, где это поддерживается, «Обновить исходные файлы» просит выбрать папку с музыкой и перезаписывает только совпадающие треки в этой папке. Мы никогда не видим эти файлы."]),
 ("Тексты песен", ["Страница «Текст» ищет трек в LRCLIB (lrclib.net), открытой базе текстов, которую ведёт сообщество. Отправляются только исполнитель и название, никогда не аудио. Поиск идёт через небольшой ретранслятор на нашем сервере: он хранит ответ LRCLIB в кэше Cloudflare (до 30 дней), чтобы следующий, кто слушает тот же трек, получил текст оттуда, не обращаясь к LRCLIB снова. В кэше лежит текст под названием трека, никогда не то, кто спрашивал, и ничего не записывается. Если ретранслятор недоступен, браузер обращается к LRCLIB напрямую. На твоём устройстве текст показывается, пока трек загружен, и никогда не сохраняется и не добавляется в экспорт аудио. В файл он попадает, только если ты выберешь стиль «Текст» при создании сторис, и сторис делается на твоём устройстве. Это можно отключить в меню ⋯, в разделе «Обложка и текст»."]),
 ("Хостинг", ["Сайт размещён на Cloudflare Pages. Как и любой хостинг, Cloudflare может хранить стандартные журналы запросов (например, IP-адрес и тип браузера) для безопасности и надёжности. Твоё аудио никогда не входит в эти запросы."]),
 ("Публикация на SoundCloud (по желанию)", [
   "Ничего не отправляется в SoundCloud, пока ты не нажмёшь «Выложить на SoundCloud», не подключишь аккаунт и не подтвердишь публикацию.",
   "Ты входишь на странице самого SoundCloud. SoundCloud выдаёт нам одноразовый код, который небольшая функция на нашем сервере обменивает на токен доступа: для этого шага SoundCloud требует секретный ключ нашего приложения. Эта функция никогда не получает твоё аудио и не хранит и не записывает ни код, ни токен.",
   "Токен хранится только во вкладке браузера, которой ты пользуешься (session storage). Он удаляется, когда ты закрываешь вкладку или нажимаешь «Отключить», что также отзывает наш доступ в SoundCloud.",
   "При публикации аудиофайл, обложка, название, описание, теги и настройка приватности идут напрямую из твоего браузера в SoundCloud. Они не проходят через наш сервер и не хранятся на нём.",
   "Пока аккаунт подключён, мы читаем твоё имя пользователя SoundCloud (чтобы показать, кто подключён) и твои плейлисты (чтобы найти или создать плейлист «Remixity»). Мы ничего из этого не сохраняем.",
   "То, что ты загружаешь в SoundCloud, регулируется условиями и политикой конфиденциальности SoundCloud."]),
 ("Меню «Поделиться» устройства", ["«Поделиться…» передаёт экспортированный файл в системное меню твоего устройства. Мы не видим, куда ты его отправляешь."]),
 ("Контакты", ["THE REMIXITY делает @iliyabarcari. Вопросы и запросы о твоих данных: пиши @iliyabarcari в Instagram."]),
]),
}

TERMS = {
"en": ("Terms", [
 ("Using THE REMIXITY", ["THE REMIXITY is a free tool. Everything runs in your browser. It is provided “as is”, without warranties of any kind, and we're not liable for any loss arising from its use."]),
 ("Your audio, your responsibility", ["Lyrics shown on the Lyrics page come from LRCLIB and belong to their songwriters and publishers; they are shown for listening along. If you put them in a story, keep it to a short clip for sharing what you're listening to. You are responsible for the audio you load, export and share. Only share remixes of audio you have the rights to. A slowed, sped-up or reverb version of someone else's song is usually still their copyrighted work."]),
 ("Sharing to SoundCloud", [
   "Posting to SoundCloud only happens when you connect your own account and confirm the post. You choose the title, description, tags, artwork and whether it's private (the default) or public.",
   "Uploads are subject to SoundCloud's Terms of Use. SoundCloud may block or remove audio it finds infringing, and repeated problems can affect your SoundCloud account.",
   "THE REMIXITY is not affiliated with, sponsored or endorsed by SoundCloud. SoundCloud is a trademark of SoundCloud Global Limited & Co. KG.",
   "Don't use THE REMIXITY to post spam or to upload content in bulk or automatically."]),
 ("Your library", ["Your library lives only in your browser. We can't see it, back it up or restore it, so keep your original files.", "“Fix my library” and the cover search suggest names and covers from public catalogues. They can be wrong: check the list before you press Apply. “Update original files” rewrites files in the folder you pick, so keep a backup of your music before using it.", "Covers, artist photos and lyrics belong to their owners and are shown to help you recognise and enjoy your own music."]),
 ("Other services", ["THE REMIXITY is not affiliated with Apple, Deezer, MusicBrainz, LRCLIB, Instagram or SoundCloud. Their names are trademarks of their owners."]),
 ("Who makes it", ["THE REMIXITY is made by @iliyabarcari (Instagram)."]),
 ("Changes", ["We may update these terms. The date at the top shows the latest version."]),
]),
"ro": ("Termeni", [
 ("Folosirea THE REMIXITY", ["THE REMIXITY e un instrument gratuit. Totul rulează în browserul tău. Este oferit „ca atare”, fără garanții de niciun fel, și nu răspundem pentru pierderi rezultate din folosirea lui."]),
 ("Audio-ul tău, responsabilitatea ta", ["Versurile din pagina Versuri vin din LRCLIB și aparțin autorilor și editorilor lor; sunt afișate ca să urmărești piesa. Dacă le pui într-un story, păstrează-l la un fragment scurt, ca să arăți ce asculți. Ești responsabil pentru audio-ul pe care îl încarci, exporți și distribui. Distribuie doar remixuri ale unor piese pentru care ai drepturi. O versiune încetinită, accelerată sau cu reverb a piesei altcuiva e de obicei tot opera lor protejată de drepturi de autor."]),
 ("Distribuirea pe SoundCloud", [
   "Publicarea pe SoundCloud are loc doar când îți conectezi propriul cont și confirmi publicarea. Tu alegi titlul, descrierea, etichetele, coperta și dacă e privată (implicit) sau publică.",
   "Încărcările sunt supuse Termenilor de utilizare SoundCloud. SoundCloud poate bloca sau șterge audio pe care îl consideră încălcare, iar problemele repetate îți pot afecta contul SoundCloud.",
   "THE REMIXITY nu e afiliat, sponsorizat sau susținut de SoundCloud. SoundCloud este o marcă a SoundCloud Global Limited & Co. KG.",
   "Nu folosi THE REMIXITY pentru spam sau pentru încărcări în masă ori automate."]),
 ("Biblioteca ta", ["Biblioteca ta există doar în browserul tău. Nu o putem vedea, salva sau recupera, așa că păstrează fișierele originale.", "„Repară biblioteca” și căutarea de coperte sugerează nume și coperte din cataloage publice. Se pot înșela: verifică lista înainte să apeși Aplică. „Actualizează fișierele originale” rescrie fișiere din dosarul pe care îl alegi, așa că fă o copie de rezervă a muzicii înainte.", "Copertele, fotografiile artiștilor și versurile aparțin proprietarilor lor și sunt afișate ca să-ți recunoști și să te bucuri de propria muzică."]),
 ("Alte servicii", ["THE REMIXITY nu e afiliat cu Apple, Deezer, MusicBrainz, LRCLIB, Instagram sau SoundCloud. Numele lor sunt mărci ale proprietarilor lor."]),
 ("Cine îl face", ["THE REMIXITY este făcut de @iliyabarcari (Instagram)."]),
 ("Modificări", ["Putem actualiza acești termeni. Data de sus arată ultima versiune."]),
]),
"ru": ("Условия", [
 ("Использование THE REMIXITY", ["THE REMIXITY — бесплатный инструмент. Всё работает в твоём браузере. Он предоставляется «как есть», без каких-либо гарантий, и мы не несём ответственности за потери, связанные с его использованием."]),
 ("Твоё аудио — твоя ответственность", ["Тексты на странице «Текст» берутся из LRCLIB и принадлежат их авторам и издателям; они показываются, чтобы подпевать. Если добавляешь их в сторис, ограничься коротким фрагментом, чтобы показать, что ты слушаешь. Ты отвечаешь за аудио, которое загружаешь, экспортируешь и публикуешь. Публикуй только ремиксы аудио, на которое у тебя есть права. Замедленная, ускоренная или реверб-версия чужой песни обычно остаётся их произведением, защищённым авторским правом."]),
 ("Публикация на SoundCloud", [
   "Публикация на SoundCloud происходит, только когда ты подключаешь свой аккаунт и подтверждаешь её. Ты выбираешь название, описание, теги, обложку и делаешь трек приватным (по умолчанию) или публичным.",
   "Загрузки подчиняются Условиям использования SoundCloud. SoundCloud может заблокировать или удалить аудио, которое сочтёт нарушением, а повторные нарушения могут повлиять на твой аккаунт SoundCloud.",
   "THE REMIXITY не связан с SoundCloud и не спонсируется и не одобряется им. SoundCloud — товарный знак SoundCloud Global Limited & Co. KG.",
   "Не используй THE REMIXITY для спама и для массовых или автоматических загрузок."]),
 ("Твоя медиатека", ["Медиатека существует только в твоём браузере. Мы не можем её увидеть, сохранить или восстановить, поэтому храни оригинальные файлы.", "«Привести в порядок» и поиск обложек предлагают названия и обложки из открытых каталогов. Они могут ошибаться: проверь список, прежде чем нажать «Применить». «Обновить исходные файлы» перезаписывает файлы в выбранной папке, поэтому сначала сделай резервную копию музыки.", "Обложки, фото исполнителей и тексты принадлежат их владельцам и показываются, чтобы ты узнавал свою музыку и наслаждался ей."]),
 ("Другие сервисы", ["THE REMIXITY не связан с Apple, Deezer, MusicBrainz, LRCLIB, Instagram или SoundCloud. Их названия — товарные знаки их владельцев."]),
 ("Кто делает", ["THE REMIXITY делает @iliyabarcari (Instagram)."]),
 ("Изменения", ["Мы можем обновлять эти условия. Дата вверху показывает последнюю версию."]),
]),
}

IG = "https://instagram.com/iliyabarcari"
MADE = {"en": "Made by", "ro": "Făcut de", "ru": "Сделал"}

def linkify(text):
    """Every mention of @iliyabarcari links to the Instagram profile."""
    return text.replace("@iliyabarcari", f'<a href="{IG}" target="_blank" rel="noopener">@iliyabarcari</a>')

DESC = {
  "privacy": "How THE REMIXITY handles your data: your audio and music library stay on your device; only song names are used to look up covers and lyrics.",
  "terms": "Terms for using THE REMIXITY, the free in-browser music editor, player and story maker.",
}

def page(name, content, title_en):
    sections = []
    for lang in ("en", "ro", "ru"):
        title, parts = content[lang]
        body = "".join(f"<h2>{html.escape(h)}</h2>" + "".join(f"<p>{linkify(html.escape(p))}</p>" for p in ps) for h, ps in parts)
        sections.append(f'''    <article lang="{lang}" hidden>
      <h1>{html.escape(title)}</h1>
      <p class="date">{UPDATED[lang]}</p>
      {body}
      <p class="back"><a href="/">← {BACK[lang]}</a></p>
      <p class="made">{MADE[lang]} <a href="{IG}" target="_blank" rel="noopener">@iliyabarcari</a></p>
    </article>''')
    return f'''<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#120c1f" />
    <title>{title_en} · THE REMIXITY</title>
    <meta name="description" content="{DESC[name]}" />
    <link rel="canonical" href="https://remixity.app/{name}" />
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
      .made {{ color: rgba(255,255,255,.55); font-size: .88rem; }}
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
        if (location.hostname === 'remixity.pages.dev' || location.hostname === 'www.remixity.app') location.replace('https://remixity.app' + location.pathname + location.search);
      }})();
    </script>
  </body>
</html>
'''
open('public/privacy.html','w',encoding='utf-8').write(page('privacy', PRIVACY, 'Privacy'))
open('public/terms.html','w',encoding='utf-8').write(page('terms', TERMS, 'Terms'))
print('ok')
