"""Texts of the feature pages, per language (scripts/build-pages.py builds them).

Each language lists the same pages in the same order. Every feature described
must exist in the app. Screenshot names are shared; the build picks the
version made in that language (scripts/shots.mjs).
"""

EN = [
  {
    "slug": "slow-reverb",
    "nav": "Slowed + reverb",
    "title": "Slowed and Reverb Generator: Free Online, No Download · THE REMIXITY",
    "desc": "Free slowed and reverb generator: slow down any song, add reverb, make daycore, sped up or nightcore edits, then download MP3 320 or WAV. In your browser, nothing uploaded.",
    "h1": "Slowed and reverb generator, free and online",
    "lead": "Pick a song from your phone or computer, slide the pedal down, and THE REMIXITY slows it and adds the reverb for you: a slowed + reverb version in seconds. Slide it up for sped up and nightcore. No app to install, no account, and your music never leaves your device.",
    "hero": ("app-pedal", "The pedal in THE REMIXITY: the song slowed to ×0.85 at 119 BPM"),
    "sections": [
      ("One pedal does it", [
        "Slide the pedal down to slow the song, up to speed it up, from half speed (×0.5) to one and a half (×1.5). The BPM updates as you go, so you can aim for a tempo rather than a number.",
        "The reverb follows the pedal: the slower the song, the bigger and darker the room it plays in. That's the classic slowed + reverb sound, without touching a single slider. Want to set it yourself? Open the reverb page and change the size, tone and amount.",
      ], ("app-space", "Reverb and echo settings, with the echo synced to the beat")),
      ("Slowed, daycore, sped up or nightcore", [
        "It's one pedal for all four. Slowed + reverb is the song slower and lower with a big reverb. Daycore is the slowed, lower version on its own: take the reverb down on the reverb page. Sped up is the song a little faster and higher, and nightcore is the same pushed further, past ×1.25.",
        "The speed is shown as ×0.85, ×1.20 and so on, with the tempo in BPM next to it, so you can make the same edit again or match a tempo exactly.",
      ], None),
      ("Slow down without lowering the pitch", [
        "Classic slowed songs drop in pitch, like a record spinning slower. If you want the song slower but in the same key, turn on Keep pitch: the speed changes, the voice stays where it was.",
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
      ("Can I make a sped up or nightcore version?", "Yes. Slide the pedal up instead of down: a little for sped up, past ×1.25 for nightcore."),
      ("What's the difference between slowed + reverb and daycore?", "Both are the song slowed down and lower. Slowed + reverb adds a big reverb; daycore usually keeps it dry. THE REMIXITY adds the reverb automatically, and you can turn it down for daycore."),
    ],
    "related": ["mix-songs", "audio-editor", "instagram-story-maker"],
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
    "related": ["mix-songs", "instagram-story-maker", "slow-reverb"],
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

RU = [
  {
    "slug": "slow-reverb",
    "nav": "Slowed + reverb",
    "title": "Slowed and Reverb генератор онлайн: замедлить песню бесплатно · THE REMIXITY",
    "desc": "Бесплатный генератор slowed and reverb: замедли любую песню, добавь реверб, сделай daycore, sped up или nightcore и скачай MP3 320 или WAV. В браузере, без загрузки.",
    "h1": "Генератор slowed and reverb онлайн, бесплатно",
    "lead": "Выбери песню на телефоне или компьютере, сдвинь педаль вниз, и THE REMIXITY замедлит её и сам добавит реверб: замедленная версия с реверберацией за секунды. Сдвинь вверх, и получится sped up или nightcore. Без установки и регистрации, а твоя музыка не покидает устройство.",
    "hero": ("app-pedal", "Педаль в THE REMIXITY: песня замедлена до ×0.85, 119 BPM"),
    "sections": [
      ("Всё делает одна педаль", [
        "Сдвинь педаль вниз, чтобы замедлить песню, или вверх, чтобы ускорить: от половины скорости (×0.5) до полуторной (×1.5). BPM меняется вместе с ней, так что можно целиться в нужный темп, а не в цифру.",
        "Реверб идёт за педалью: чем медленнее песня, тем больше и темнее зал, в котором она звучит. Это и есть классический slowed + reverb, без единого лишнего ползунка. Хочешь настроить сам? Открой страницу реверба и поменяй размер, тон и громкость эффекта.",
      ], ("app-space", "Настройки реверба и эха, эхо в такт песне")),
      ("Slowed, daycore, sped up или nightcore", [
        "Всё это делает одна педаль. Slowed + reverb — песня медленнее и ниже с мощным ревербом. Daycore — то же замедление, но без реверба: убери его на странице реверба. Sped up — песня чуть быстрее и выше, а nightcore — то же самое, только сильнее, дальше ×1.25.",
        "Скорость показывается как ×0.85, ×1.20 и так далее, рядом с темпом в BPM, так что можно повторить ту же обработку или попасть точно в нужный темп.",
      ], None),
      ("Замедлить песню, не меняя тональность", [
        "Обычные slowed-версии звучат ниже, как пластинка на меньших оборотах. Если нужна песня медленнее, но в той же тональности, включи «Сохранить тон»: скорость меняется, а голос остаётся на месте.",
      ], None),
      ("Сохрани результат", [
        "Сохрани ремикс в MP3 320 кбит/с или в WAV на 16 или 24 бита. Переименуй файл и укажи название, исполнителя и обложку, которые покажут плееры. С телефона можно сразу поделиться.",
      ], ("app-export", "Экспорт: MP3 320 или WAV, с названием, исполнителем и обложкой")),
    ],
    "steps": [
      "Открой THE REMIXITY и выбери песню (MP3, WAV, FLAC, M4A, AAC, OGG, Opus или AIFF).",
      "Сдвинь педаль вниз, пока не зазвучит как надо. Реверб добавится сам.",
      "Нажми кнопку загрузки и сохрани в MP3 или WAV.",
    ],
    "faq": [
      ("Это бесплатно?", "Да. Без регистрации и без водяных знаков на звуке."),
      ("Моя песня куда-то загружается?", "Нет. Песня декодируется, обрабатывается и сохраняется на твоём устройстве. Она уходит куда-то, только если ты сам решишь ею поделиться."),
      ("Работает на iPhone?", "Да, в Safari. Сайт можно добавить на экран «Домой» и пользоваться им как приложением, с управлением с экрана блокировки."),
      ("Как замедлить песню без программ?", "Открой remixity.app в браузере, выбери песню и сдвинь педаль. Всё происходит прямо на странице."),
      ("Можно сделать ускоренную версию или nightcore?", "Да. Сдвинь педаль не вниз, а вверх: немного — для sped up, дальше ×1.25 — для nightcore."),
      ("Чем slowed + reverb отличается от daycore?", "Оба — это замедленная и более низкая песня. В slowed + reverb добавляется большой реверб, а daycore обычно без него. THE REMIXITY добавляет реверб сам, а для daycore его можно убрать."),
    ],
    "related": ["mix-songs", "audio-editor", "instagram-story-maker"],
  },
  {
    "slug": "audio-editor",
    "nav": "Аудиоредактор",
    "title": "Онлайн аудиоредактор для песен: скорость, реверб, эквалайзер · THE REMIXITY",
    "desc": "Редактируй песни онлайн: меняй скорость с тоном или без, добавляй реверб и эхо, настраивай 5-полосный эквалайзер, обрезай лишнее и сохраняй в MP3 или WAV.",
    "h1": "Онлайн-редактор музыки прямо в браузере",
    "lead": "THE REMIXITY сделан для песен, а не для подкастов. Меняй скорость и тон, накладывай реверб на MP3, подстраивай звук эквалайзером, вырезай лишнее и сохраняй чистый файл. Всё это происходит на твоём устройстве.",
    "hero": ("app-eq", "5-полосный эквалайзер со спектром песни"),
    "sections": [
      ("Скорость и тон", [
        "Ускоряй или замедляй от ×0.5 до ×1.5. По умолчанию тон меняется вместе со скоростью, как у пластинки; с «Сохранить тон» песня остаётся в своей тональности. Темп (BPM) определяется сам и следует за каждым изменением.",
      ], ("app-pedal", "Педаль с BPM и сохранением тона")),
      ("Реверб и эхо", [
        "Наложи реверб на MP3 или любую другую песню: выбери размер зала, насколько тёмно он звучит и сколько его слышно. Эхо можно привязать к темпу песни (четверти, восьмые, восьмые с точкой или шестнадцатые) или задать вручную.",
      ], ("app-space", "Реверб и эхо, эхо привязано к темпу")),
      ("5-полосный эквалайзер, который видно", [
        "Перетаскивай точки, чтобы поднять или убрать бас, нижнюю середину, середину, верха и «воздух», прямо поверх живой картины частот музыки.",
      ], None),
      ("Обрезать, вырезать, зациклить", [
        "На странице «Нарезка» песня видна как волна. Выдели фрагмент, чтобы оставить только его или вырезать, ставь метки, зацикли кусок во время прослушивания и отменяй любые действия.",
      ], ("app-chop", "Редактор волны: обрезка, вырезание, цикл и отмена")),
      ("Чистый экспорт", [
        "Сохраняй в MP3 320 кбит/с или WAV (16 или 24 бита) с лимитером, чтобы ничего не клиппило. Перед сохранением задай имя файла, название, исполнителя и обложку.",
      ], ("app-export", "Экспорт в MP3 или WAV с тегами")),
    ],
    "steps": [
      "Выбери песню: ничего не загружается.",
      "Листай страницы: скорость, реверб и эхо, эквалайзер, нарезка.",
      "Сохрани в MP3 или WAV или поделись с телефона.",
    ],
    "faq": [
      ("Можно бесплатно наложить реверб на MP3 онлайн?", "Да. Открой песню, перейди на страницу реверба и выбери уровень. Когда всё готово, сохрани в MP3."),
      ("Какие файлы можно редактировать?", "MP3, WAV, FLAC, M4A, AAC, OGG, Opus и AIFF, всё, что умеет открыть твой браузер (почти все умеют)."),
      ("Качество не упадёт?", "Звук обрабатывается с 32-битной точностью и сохраняется в MP3 320 кбит/с или в WAV без потерь."),
    ],
    "related": ["slow-reverb", "music-library", "music-card-maker"],
  },
  {
    "slug": "music-library",
    "nav": "Медиатека и тексты",
    "title": "Музыкальный плеер с синхронным текстом песен онлайн · THE REMIXITY",
    "desc": "Держи свою музыку в медиатеке на устройстве: исполнители, плейлисты и настоящий плеер с текстом, который идёт вместе с песней. Исправь названия и обложки разом.",
    "h1": "Плеер с синхронным текстом для твоих файлов",
    "lead": "Добавь песни или целую папку, и THE REMIXITY станет твоим плеером: исполнители, плейлисты и очередь, а текст подсвечивается строка за строкой, пока песня играет. Медиатека хранится в браузере, на твоём устройстве.",
    "hero": ("app-lyrics-full", "Текст на весь экран: подсвечена строка, которая звучит"),
    "sections": [
      ("Текст идёт вместе с музыкой", [
        "Для песен с синхронным текстом звучащая строка подсвечивается, а остальные прокручиваются сами. Нажми на текст, чтобы открыть его на весь экран, и нажми на любую строку, чтобы перейти к ней. Синхронность сохраняется, даже если песню замедлить или ускорить.",
        "Тексты берутся из LRCLIB, открытой базы текстов песен, и показываются, только пока песня загружена.",
      ], ("app-lyrics", "Страница текста в плеере")),
      ("Твоя медиатека на твоём устройстве", [
        "Добавь песни из «Файлов» или целую папку. Они хранятся в браузере на этом устройстве и разложены по песням, исполнителям (с их фото) и твоим плейлистам. Играй, перемешивай, ставь следующей, а очередь сама переходит к следующей песне.",
      ], ("app-library", "Медиатека: песни с обложками")),
      ("Порядок в названиях и обложках", [
        "У скачанных файлов часто названия вроде «Artist - Song (Official Video) 320kbps». «Привести в порядок» ищет каждую песню в открытых музыкальных каталогах, предлагает правильные название, исполнителя и обложку и ничего не меняет, пока ты не подтвердишь список.",
        "Потом сохрани исправленные копии, с новыми названиями, тегами и обложками, обратно в «Файлы».",
      ], ("app-artists", "Исполнители в медиатеке")),
      ("Работает как приложение", [
        "Добавь THE REMIXITY на экран «Домой». Музыка играет и при заблокированном экране, а кнопки на экране блокировки и в наушниках работают: пауза, следующая и предыдущая.",
      ], None),
    ],
    "steps": [
      "Открой медиатеку и добавь песни или папку.",
      "Включи песню и перелистни на страницу текста.",
      "Запусти «Привести в порядок», чтобы исправить названия и обложки.",
    ],
    "faq": [
      ("Мои песни куда-то загружаются?", "Нет. Медиатека хранится в браузере на твоём устройстве. Оригиналы файлов тоже сохраняй: браузеры могут очищать данные сайтов."),
      ("Откуда берутся тексты?", "Из LRCLIB, открытой базы текстов, которую ведёт сообщество. Для поиска используются только исполнитель и название."),
      ("Можно пользоваться на компьютере?", "Да, в Chrome, Edge, Safari или Firefox. В Chrome и Edge на компьютере можно даже перезаписать оригинальные файлы в папке с музыкой, с исправленными названиями, тегами и обложками."),
    ],
    "related": ["mix-songs", "instagram-story-maker", "slow-reverb"],
  },
  {
    "slug": "instagram-story-maker",
    "nav": "Сторис для Instagram",
    "title": "Сторис с музыкой для Instagram: песня, текст и обложка · THE REMIXITY",
    "desc": "Сделай из песни сторис для Instagram: видео с твоим ремиксом, текстом, который идёт в такт, крутящейся пластинкой или волнами. 1080×1920, прямо на телефоне.",
    "h1": "Сторис для Instagram из твоей музыки",
    "lead": "Делись тем, что слушаешь, настоящим видео: играет твой ремикс (замедленный, ускоренный или с реверберацией, ровно таким, как ты его сделал), а текст идёт вместе с песней, крутится пластинка или в такт двигаются волны. Делается на телефоне за секунды.",
    "hero": ("story-lyrics", "Сторис с текстом: звучащая строка подсвечена"),
    "story": True,
    "sections": [
      ("Пять стилей", [
        "«Обложка» помещает арт в аккуратную карточку. «Текст» показывает слова строка за строкой в такт музыке. «Винил» превращает обложку в наклейку крутящейся пластинки, которая крутится медленнее, если песня замедлена. «Вся обложка» заполняет экран артом. «Волны» добавляют полоски, которые двигаются вместе с настоящим звуком.",
      ], ("story-vinyl", "Сторис «Винил»: обложка стала наклейкой крутящейся пластинки")),
      ("Твой ремикс, твоя скорость", [
        "В видео звучит фрагмент песни на 15 или 30 секунд, ровно так, как ты слышишь его в THE REMIXITY: скорость, реверб, эквалайзер. Выбери, с какого места он начинается.",
      ], ("story-waves", "Сторис «Волны» со строкой текста")),
      ("Под себя", [
        "Выбери фон (размытая обложка, её цвета или тёмный), показывай звучащую строку текста под любым стилем и включай или прячь значок скорости. Превью обновляется сразу.",
      ], ("app-story-sheet", "Создание сторис в приложении")),
      ("Чёткое видео, готовое к публикации", [
        "Видео получается 1080×1920, H.264 MP4 со звуком AAC, именно в том формате, которого ждёт Instagram. Когда всё готово, нажми «Поделиться», выбери Instagram, затем «История».",
      ], None),
    ],
    "steps": [
      "Включи песню в THE REMIXITY и открой окно загрузки.",
      "Нажми «Сделать сторис», выбери стиль и «Видео 15 с» или «30 с».",
      "Нажми «Создать», затем «Поделиться» → Instagram → «История».",
    ],
    "faq": [
      ("Как добавить песню с текстом в сторис Instagram?", "Выбери стиль «Текст» (или включи строку текста под любым стилем). Слова идут в видео вместе с музыкой. Работает для песен с синхронным текстом."),
      ("Можно выложить замедленную или ускоренную версию?", "Да. Сторис использует твой ремикс ровно так, как ты его настроил, а пластинка и волны следуют его скорости."),
      ("Моя музыка куда-то загружается?", "Нет. Видео создаётся на твоём устройстве и уходит только туда, куда ты им поделишься."),
    ],
    "related": ["music-card-maker", "music-library", "slow-reverb"],
  },
  {
    "slug": "music-card-maker",
    "nav": "Музыкальные карточки",
    "title": "Музыкальные карточки: обложка, название и текст песни · THE REMIXITY",
    "desc": "Сделай музыкальную карточку для любой песни: обложка, название, исполнитель и скорость ремикса в красивом дизайне. Картинки PNG размером со сторис, бесплатно.",
    "h1": "Музыкальные карточки для любимых песен",
    "lead": "Музыкальная карточка — это картинка с тем, что ты слушаешь: обложка, название и исполнитель, а если ты сделал ремикс, то и его скорость. Сделай её за секунду и поделись в сторис, посте или чате.",
    "hero": ("story-card", "Музыкальная карточка: обложка, название, исполнитель и скорость"),
    "story": True,
    "sections": [
      ("Выбери дизайн", [
        "Классическая белая карточка, обложка на весь экран, виниловая пластинка, текст звучащего момента или обложка с волнами. Каждый дизайн собирается из обложки самой песни и её цветов.",
      ], ("story-full", "Дизайн «Вся обложка» со строкой текста")),
      ("Поймай момент", [
        "Выбери момент в песне: с включённой строкой текста на карточке будут слова, которые звучат именно тогда. Выбери фон и реши, показывать ли значок скорости.",
      ], ("story-vinyl", "Дизайн «Винил»")),
      ("Нет обложки? Найдётся", [
        "Песни без обложки её получат: THE REMIXITY ищет обложку в открытых каталогах или делает аккуратную собственную с названием.",
      ], None),
      ("Готово, чтобы делиться", [
        "Карточки — это картинки PNG 1080×1920, размером со сторис. Сохрани на телефон или поделись прямо из приложения.",
      ], None),
    ],
    "steps": [
      "Включи песню в THE REMIXITY и открой окно загрузки.",
      "Нажми «Сделать сторис» и оставь «Картинка».",
      "Выбери стиль, нажми «Создать», затем «Поделиться».",
    ],
    "faq": [
      ("Это бесплатно?", "Да, и без водяных знаков, кроме небольшой строчки THE REMIXITY."),
      ("Какого размера карточки?", "1080×1920 пикселей (PNG), размер сторис в Instagram или WhatsApp."),
      ("А можно видео?", "Да: выбери «Видео 15 с» или «30 с», и получится анимированная сторис с песней."),
    ],
    "related": ["instagram-story-maker", "music-library", "audio-editor"],
  },
]

RO = [
  {
    "slug": "slow-reverb",
    "nav": "Slowed + reverb",
    "title": "Generator Slowed and Reverb online, gratuit · THE REMIXITY",
    "desc": "Generator slowed and reverb gratuit: încetinește orice melodie, adaugă reverb, fă daycore, sped up sau nightcore, apoi descarcă MP3 320 sau WAV. În browser, fără încărcare.",
    "h1": "Generator slowed and reverb, gratuit și online",
    "lead": "Alege o melodie de pe telefon sau calculator, trage pedala în jos, iar THE REMIXITY o încetinește și adaugă reverbul pentru tine: o versiune slowed + reverb în câteva secunde. Trage-o în sus pentru sped up și nightcore. Fără instalare, fără cont, iar muzica ta nu părăsește dispozitivul.",
    "hero": ("app-pedal", "Pedala din THE REMIXITY: melodia încetinită la ×0.85, 119 BPM"),
    "sections": [
      ("O singură pedală face totul", [
        "Trage pedala în jos ca să încetinești melodia și în sus ca s-o accelerezi, de la jumătate de viteză (×0.5) până la una și jumătate (×1.5). BPM-ul se schimbă odată cu ea, așa că poți ținti un tempo, nu un număr.",
        "Reverbul urmează pedala: cu cât melodia e mai lentă, cu atât sala în care sună e mai mare și mai întunecată. Ăsta e sunetul clasic slowed + reverb, fără să atingi vreun slider. Vrei să-l reglezi singur? Deschide pagina de reverb și schimbă mărimea, tonul și cantitatea.",
      ], ("app-space", "Setări de reverb și ecou, cu ecoul pe ritm")),
      ("Slowed, daycore, sped up sau nightcore", [
        "O singură pedală pentru toate patru. Slowed + reverb e melodia mai lentă și mai joasă, cu mult reverb. Daycore e varianta încetinită fără reverb: scade-l din pagina de reverb. Sped up e melodia puțin mai rapidă și mai sus, iar nightcore e același lucru dus mai departe, peste ×1.25.",
        "Viteza apare ca ×0.85, ×1.20 și așa mai departe, cu tempoul în BPM alături, ca să poți repeta aceeași editare sau nimeri exact un tempo.",
      ], None),
      ("Încetinește fără să cobori tonalitatea", [
        "Melodiile slowed clasice coboară tonul, ca un disc care se învârte mai încet. Dacă vrei melodia mai lentă, dar în aceeași tonalitate, activează «Păstrează tonul»: viteza se schimbă, vocea rămâne unde era.",
      ], None),
      ("Exportă rezultatul", [
        "Salvează remixul ca MP3 320 kbps sau WAV pe 16 ori 24 de biți. Redenumește fișierul și setează titlul, artistul și coperta pe care le vor afișa playerele. De pe telefon îl poți distribui direct.",
      ], ("app-export", "Opțiuni de export: MP3 320 sau WAV, cu titlu, artist și copertă")),
    ],
    "steps": [
      "Deschide THE REMIXITY și alege o melodie (MP3, WAV, FLAC, M4A, AAC, OGG, Opus sau AIFF).",
      "Trage pedala în jos până sună cum vrei. Reverbul vine odată cu ea.",
      "Apasă butonul de descărcare și salvează ca MP3 sau WAV.",
    ],
    "faq": [
      ("E gratuit?", "Da. Fără cont și fără filigran pe sunet."),
      ("Melodia mea e încărcată undeva?", "Nu. Melodia e decodată, procesată și exportată pe dispozitivul tău. Pleacă undeva doar dacă alegi s-o distribui."),
      ("Merge pe iPhone?", "Da, în Safari. O poți adăuga și pe ecranul principal și s-o folosești ca pe o aplicație, cu controalele de pe ecranul de blocare."),
      ("Cum încetinesc o melodie fără să descarc un program?", "Deschide remixity.app în browser, alege melodia și trage pedala. Totul se întâmplă în pagină."),
      ("Pot face o versiune sped up sau nightcore?", "Da. Trage pedala în sus în loc de jos: puțin pentru sped up, peste ×1.25 pentru nightcore."),
      ("Care e diferența dintre slowed + reverb și daycore?", "Ambele sunt melodia încetinită și mai joasă. Slowed + reverb adaugă mult reverb; daycore de obicei rămâne fără. THE REMIXITY adaugă reverbul singur, iar pentru daycore îl poți scădea."),
    ],
    "related": ["mix-songs", "audio-editor", "instagram-story-maker"],
  },
  {
    "slug": "audio-editor",
    "nav": "Editor audio",
    "title": "Editor audio online pentru melodii: viteză, reverb, EQ · THE REMIXITY",
    "desc": "Editează melodii online: schimbă viteza cu sau fără ton, adaugă reverb și ecou, modelează sunetul cu un EQ cu 5 benzi, taie bucăți, apoi exportă MP3 sau WAV.",
    "h1": "Un editor muzical online, direct în browser",
    "lead": "THE REMIXITY e făcut pentru melodii, nu pentru podcasturi. Schimbă viteza și tonul, adaugă reverb unui MP3, modelează-l cu un egalizator, taie ce nu-ți place și exportă un fișier curat. Totul se întâmplă pe dispozitivul tău.",
    "hero": ("app-eq", "Egalizatorul cu 5 benzi, cu spectrul melodiei în spate"),
    "sections": [
      ("Viteză și ton", [
        "Accelerează sau încetinește de la ×0.5 la ×1.5. Implicit tonul se mișcă odată cu viteza, ca la un disc; cu «Păstrează tonul», melodia rămâne în tonalitatea ei. Tempoul (BPM) e detectat pentru tine și urmează fiecare schimbare.",
      ], ("app-pedal", "Pedala cu BPM și păstrarea tonului")),
      ("Reverb și ecou", [
        "Adaugă reverb unui MP3 sau oricărei melodii: alege cât de mare e sala, cât de întunecat sună și cât din el se aude. Ecoul se poate lega de tempoul melodiei (pătrimi, optimi, optimi cu punct sau șaisprezecimi) sau se setează liber.",
      ], ("app-space", "Reverb și ecou, cu ecoul legat de tempo")),
      ("Un EQ cu 5 benzi pe care îl vezi", [
        "Trage punctele ca să crești sau să tai basul, mediile joase, mediile, înaltele și „aerul”, peste o imagine live a frecvențelor muzicii.",
      ], None),
      ("Taie, decupează, repetă în buclă", [
        "Pagina «Tăiere» arată melodia ca formă de undă. Selectează o parte ca s-o păstrezi doar pe ea sau s-o tai, pune marcaje, repetă o secțiune în buclă cât asculți și anulează orice.",
      ], ("app-chop", "Editorul de formă de undă: tăiere, buclă și anulare")),
      ("Exporturi curate", [
        "Exportă ca MP3 320 kbps sau WAV (16 ori 24 de biți) cu un limitator care previne distorsiunea. Setează numele fișierului, titlul, artistul și coperta înainte de salvare.",
      ], ("app-export", "Export MP3 sau WAV cu etichete")),
    ],
    "steps": [
      "Alege o melodie; nu se încarcă nimic.",
      "Glisează prin pagini: viteză, reverb și ecou, EQ, tăiere.",
      "Exportă ca MP3 sau WAV sau distribuie de pe telefon.",
    ],
    "faq": [
      ("Pot adăuga reverb unui MP3 online, gratuit?", "Da. Deschide melodia, mergi la pagina de reverb și setează cât vrei. Exportă ca MP3 când ai terminat."),
      ("Ce tipuri de fișiere pot edita?", "MP3, WAV, FLAC, M4A, AAC, OGG, Opus și AIFF, atât cât le poate deschide browserul tău (majoritatea pot)."),
      ("Scade calitatea?", "Sunetul e procesat cu precizie de 32 de biți și exportat ca MP3 320 kbps sau WAV fără pierderi."),
    ],
    "related": ["slow-reverb", "music-library", "music-card-maker"],
  },
  {
    "slug": "music-library",
    "nav": "Bibliotecă și versuri",
    "title": "Player muzical cu versuri sincronizate și bibliotecă · THE REMIXITY",
    "desc": "Ține-ți muzica într-o bibliotecă pe dispozitiv: artiști, playlisturi și un player adevărat, cu versuri care urmează melodia. Repară numele și copertele dintr-o dată.",
    "h1": "Un player cu versuri sincronizate pentru fișierele tale",
    "lead": "Adaugă melodii sau un folder întreg și THE REMIXITY devine playerul tău: artiști, playlisturi și o coadă de redare, cu versuri care se aprind rând cu rând cât cântă melodia. Biblioteca rămâne în browser, pe dispozitivul tău.",
    "hero": ("app-lyrics-full", "Versuri pe tot ecranul: rândul cântat e evidențiat"),
    "sections": [
      ("Versuri care urmează muzica", [
        "La melodiile cu versuri sincronizate, rândul cântat se aprinde, iar restul derulează singure. Atinge versurile pentru vizualizarea pe tot ecranul și atinge orice rând ca să sari la el. Rămân sincronizate chiar dacă încetinești sau accelerezi melodia.",
        "Versurile vin din LRCLIB, o bază de date deschisă de versuri, și apar doar cât e încărcată melodia.",
      ], ("app-lyrics", "Pagina de versuri din player")),
      ("Biblioteca ta, pe dispozitivul tău", [
        "Adaugă melodii din Fișiere sau un folder întreg. Sunt păstrate în browser pe acest dispozitiv, sortate pe melodii, artiști (cu fotografii) și playlisturile pe care le faci. Redă, amestecă, pune următoarea, iar coada trece singură la melodia următoare.",
      ], ("app-library", "Biblioteca: melodii cu copertele lor")),
      ("Repară numele și copertele", [
        "Fișierele descărcate au des nume ca „Artist - Song (Official Video) 320kbps”. «Repară biblioteca» caută fiecare melodie în cataloage muzicale publice, propune titlul, artistul și coperta corecte și nu schimbă nimic până nu aprobi lista.",
        "Apoi salvează copii curățate, cu numele, etichetele și copertele noi, înapoi în Fișiere.",
      ], ("app-artists", "Artiștii din bibliotecă")),
      ("Merge ca o aplicație", [
        "Adaugă THE REMIXITY pe ecranul principal. Muzica merge și cu ecranul blocat, iar butoanele de pe ecranul de blocare și de pe căști funcționează: redare, pauză, următoarea și anterioara.",
      ], None),
    ],
    "steps": [
      "Deschide biblioteca și adaugă melodii sau un folder.",
      "Pornește o melodie și glisează la pagina de versuri.",
      "Folosește «Repară biblioteca» ca să faci ordine în nume și coperte.",
    ],
    "faq": [
      ("Melodiile mele sunt încărcate undeva?", "Nu. Biblioteca stă în stocarea browserului pe dispozitivul tău. Păstrează și fișierele originale: browserele pot șterge datele site-urilor."),
      ("De unde vin versurile?", "Din LRCLIB, o bază de date deschisă de versuri, făcută de comunitate. Pentru căutare se folosesc doar artistul și titlul."),
      ("Pot să-l folosesc pe calculator?", "Da, în Chrome, Edge, Safari sau Firefox. În Chrome și Edge pe calculator poți chiar rescrie fișierele originale din folderul cu muzică, cu numele, etichetele și copertele curățate."),
    ],
    "related": ["mix-songs", "instagram-story-maker", "slow-reverb"],
  },
  {
    "slug": "instagram-story-maker",
    "nav": "Story-uri Instagram",
    "title": "Creator de story-uri Instagram cu muzică și versuri · THE REMIXITY",
    "desc": "Transformă o melodie într-un story Instagram: un video cu remixul tău, versuri sincronizate, un vinil care se învârte sau unde în mișcare. 1080×1920, pe telefon.",
    "h1": "Fă story-uri Instagram din muzica ta",
    "lead": "Arată ce asculți printr-un video adevărat: cântă remixul tău (încetinit, accelerat sau cu reverb, exact cum l-ai făcut), iar versurile urmează melodia, un disc se învârte sau barele se mișcă pe ritm. Se face pe telefon în câteva secunde.",
    "hero": ("story-lyrics", "Un story cu versuri: rândul cântat se aprinde"),
    "story": True,
    "sections": [
      ("Cinci stiluri", [
        "«Copertă» pune grafica într-un card curat. «Versuri» arată cuvintele rând cu rând, în ritmul muzicii. «Vinil» transformă coperta în eticheta unui disc care se învârte, mai încet când melodia e încetinită. «Copertă întreagă» umple ecranul cu grafica. «Unde» adaugă bare care se mișcă după sunetul real.",
      ], ("story-vinyl", "Un story Vinil: coperta e eticheta unui disc care se învârte")),
      ("Remixul tău, viteza ta", [
        "Videoul conține un fragment de 15 sau 30 de secunde din melodie, exact cum îl auzi în THE REMIXITY: viteza, reverbul, EQ-ul. Alege de unde începe.",
      ], ("story-waves", "Un story Unde cu rândul cântat ca subtitrare")),
      ("Personalizează-l", [
        "Alege fundalul (coperta estompată, culorile ei sau întunecat), arată rândul cântat ca subtitrare sub orice stil și arată sau ascunde viteza. Previzualizarea se actualizează imediat.",
      ], ("app-story-sheet", "Creatorul de story-uri din aplicație")),
      ("Clar și gata de postat", [
        "Videourile sunt 1080×1920, H.264 MP4 cu sunet AAC, formatul pe care îl așteaptă Instagram. Când e gata, apasă «Distribuie», alege Instagram, apoi Story.",
      ], None),
    ],
    "steps": [
      "Pornește o melodie în THE REMIXITY și deschide fereastra de descărcare.",
      "Apasă «Creează un story», alege un stil și «Video 15 s» sau «30 s».",
      "Apasă «Creează», apoi «Distribuie» → Instagram → Story.",
    ],
    "faq": [
      ("Cum pun o melodie cu versuri în story-ul de Instagram?", "Alege stilul «Versuri» (sau activează rândul cântat sub orice stil). Cuvintele urmează muzica în video. Merge pentru melodiile cu versuri sincronizate."),
      ("Pot posta o versiune încetinită sau accelerată?", "Da. Story-ul folosește remixul tău exact cum l-ai setat, iar discul și undele îi urmează viteza."),
      ("Muzica mea e încărcată undeva?", "Nu. Videoul e făcut pe dispozitivul tău și pleacă doar unde îl distribui."),
    ],
    "related": ["music-card-maker", "music-library", "slow-reverb"],
  },
  {
    "slug": "music-card-maker",
    "nav": "Carduri muzicale",
    "title": "Creator de carduri muzicale pentru melodiile tale · THE REMIXITY",
    "desc": "Fă un card muzical pentru orice melodie: coperta, titlul, artistul și viteza remixului într-un design curat. Imagini PNG cât un story, gratuit.",
    "h1": "Fă carduri muzicale pentru melodiile preferate",
    "lead": "Un card muzical e o imagine cu ce asculți: coperta, titlul și artistul și, dacă ai făcut un remix, viteza lui. Fă unul într-o secundă și distribuie-l într-un story, o postare sau un chat.",
    "hero": ("story-card", "Un card muzical: coperta, titlul, artistul și viteza"),
    "story": True,
    "sections": [
      ("Alege un design", [
        "Cardul alb clasic, coperta pe tot ecranul, un disc de vinil, versurile momentului sau coperta cu unde. Fiecare design e făcut din grafica și culorile melodiei.",
      ], ("story-full", "Designul cu coperta întreagă și rândul de versuri")),
      ("Prinde un moment", [
        "Alege momentul din melodie: cu rândul de versuri activat, cardul arată cuvintele cântate atunci. Alege fundalul și decide dacă arăți viteza.",
      ], ("story-vinyl", "Designul vinil")),
      ("Nu are copertă? Găsește una", [
        "Melodiile fără copertă primesc una: THE REMIXITY caută coperta în cataloage publice sau face una curată, generată cu titlul.",
      ], None),
      ("Gata de distribuit", [
        "Cardurile sunt imagini PNG de 1080×1920, cât un story, salvate pe telefon sau distribuite direct din aplicație.",
      ], None),
    ],
    "steps": [
      "Pornește o melodie în THE REMIXITY și deschide fereastra de descărcare.",
      "Apasă «Creează un story» și lasă «Imagine» selectat.",
      "Alege un stil, apasă «Creează», apoi «Distribuie».",
    ],
    "faq": [
      ("E gratuit?", "Da, fără filigran în afară de micul rând THE REMIXITY."),
      ("Ce mărime au cardurile?", "1080×1920 pixeli (PNG), mărimea unui story pe Instagram sau WhatsApp."),
      ("Pot face un video în loc?", "Da: alege «Video 15 s» sau «30 s» pentru un story animat cu melodia."),
    ],
    "related": ["instagram-story-maker", "music-library", "audio-editor"],
  },
]

UI = {
  "en": {"open": "Open the app", "cta": "Open THE REMIXITY, free",
         "note": "Works in your browser on iPhone, Android and computers. Nothing to install, nothing uploaded.",
         "how": "How to do it", "try": "Try it now", "questions": "Questions", "more": "More you can do with THE REMIXITY",
         "privacy": "Privacy", "terms": "Terms", "made": "Made by", "features": "Features", "language": "Language"},
  "ru": {"open": "Открыть приложение", "cta": "Открыть THE REMIXITY бесплатно",
         "note": "Работает в браузере на iPhone, Android и компьютерах. Ничего не нужно устанавливать, ничего не загружается.",
         "how": "Как это сделать", "try": "Попробовать", "questions": "Вопросы", "more": "Что ещё умеет THE REMIXITY",
         "privacy": "Конфиденциальность", "terms": "Условия", "made": "Сделал", "features": "Возможности", "language": "Язык"},
  "ro": {"open": "Deschide aplicația", "cta": "Deschide THE REMIXITY, gratuit",
         "note": "Merge în browser pe iPhone, Android și calculatoare. Nimic de instalat, nimic încărcat.",
         "how": "Cum se face", "try": "Încearcă acum", "questions": "Întrebări", "more": "Ce mai poți face cu THE REMIXITY",
         "privacy": "Confidențialitate", "terms": "Termeni", "made": "Făcut de", "features": "Funcții", "language": "Limbă"},
}


# ---------- Mix: transitions between songs (added after the first five) ----------

EN.append({
    "slug": "mix-songs",
    "nav": "Mix songs",
    "title": "Mix Two Songs Online: Free DJ Transitions, Beat-Matched · THE REMIXITY",
    "desc": "Mix songs online for free: beat-matched DJ transitions between the songs in your queue, crossfade styles, EQ and filter sweeps, song keys, and export two songs as one MP3. In your browser.",
    "h1": "Mix songs like a DJ, free and in your browser",
    "lead": "Turn on Mix and the songs in your queue blend into each other: the tempos are matched, the beats line up, and each change is a real DJ transition, not a plain fade. Shape any transition yourself, hear it, and export two songs as one mix. No subscription, nothing uploaded.",
    "hero": ("app-mix-editor", "The Mix editor: two songs stacked, their beats lined up, the transition's curves on top"),
    "sections": [
      ("Beat-matched transitions", [
        "THE REMIXITY finds each song's tempo and beat. When two songs are within 8% of each other (or half or double), the next song comes in at the tempo you're hearing, its first downbeat landing on a downbeat of the song that's ending. After the transition it glides back to its own speed.",
        "Songs that don't fit together get a clean fade instead, so nothing is forced.",
      ], None),
      ("Every transition, your way", [
        "Tap any transition between two songs to open it. Both waveforms are stacked with their own bar lines, so you can see the beats meet. Drag the next song to move where it comes in, a whole bar at a time, and choose the length: 2, 4, 8 or 16 bars.",
        "Pick a style (Fade, Rise, Blend, Wave, Melt or Slam) or build your own from three controls: Volume, EQ (bass swap or a 3-band blend) and Effect (high- and low-pass filter sweeps). Every curve is drawn on the waveforms. Hear it plays just that transition, from one bar before it if you like.",
      ], ("app-mix-list", "Your queue with a transition between every two songs; the one coming up is lit")),
      ("Keys and tempo for every song", [
        "Each song gets its BPM and its key, shown the way DJs read it (8A, 9B…). The editor tells you whether two keys go together, so you can find the transitions that sound best.",
      ], None),
      ("Mix two songs and export them as one", [
        "On the home screen, tap Mix two songs, pick two files and their order. Each song keeps its own speed, effects and automation; the transition between them is yours to shape. Export the mix as one MP3, made on your device.",
      ], ("app-mix-two", "Mix two songs: pick two files and their order")),
      ("Always in view", [
        "The Mix card under the player shows the transition that's coming: the end of this song over the start of the next, with its curves and a countdown. Tap it to change the transition. Don't want a mix between two particular songs? Switch that one off and the rest still mix.",
      ], ("app-mix-card", "The Mix card: the coming transition with its curves")),
    ],
    "steps": [
      "Play songs from your library or a playlist, or tap Mix two songs on the home screen.",
      "Tap the Mix button next to Export and turn Mix on.",
      "Tap a transition to shape it, tap Hear it, and export the mix if you want a file.",
    ],
    "faq": [
      ("Is it free?", "Yes. No subscription, no account, no watermark on the audio."),
      ("Do the beats really line up?", "When the two tempos are close enough, yes: the next song is sped up or slowed down by up to 8% and starts on a downbeat. If they're too far apart, you get a fade instead of a clash."),
      ("Can I export a mix?", "Yes. Export the mix renders two songs and their transition as one MP3, with each song's speed, effects and automation."),
      ("Does it work with slowed songs?", "Yes. Mix follows the pedal: the transition matches the tempo you're hearing, and moving the pedal during a transition keeps both songs in step."),
      ("Can I skip the transition between two songs?", "Yes. Open that transition and choose Off: those two play back to back, every other transition still mixes."),
      ("Is my music uploaded?", "No. Tempo, key and the mix are all worked out on your device."),
    ],
    "related": ["slow-reverb", "music-library", "audio-editor"],
})

RU.append({
    "slug": "mix-songs",
    "nav": "Сведение песен",
    "title": "Свести две песни онлайн: бесплатные DJ-переходы с синхронизацией бита · THE REMIXITY",
    "desc": "Сводите песни онлайн бесплатно: DJ-переходы между песнями очереди с совпадением темпа и бита, стили кроссфейда, EQ и фильтры, тональности песен и экспорт двух песен одним MP3. В браузере.",
    "h1": "Своди песни как диджей, бесплатно и в браузере",
    "lead": "Включи Микс, и песни в очереди будут перетекать друг в друга: темп подстраивается, биты совпадают, и каждая смена — настоящий диджейский переход, а не просто затухание. Настрой любой переход сам, послушай его и экспортируй две песни одним миксом. Без подписки, ничего не загружается.",
    "hero": ("app-mix-editor", "Редактор микса: две песни друг над другом, биты совпадают, кривые перехода поверх"),
    "sections": [
      ("Переходы с совпадением бита", [
        "THE REMIXITY находит темп и бит каждой песни. Если темпы отличаются не больше чем на 8% (или вдвое), следующая песня входит в том темпе, который ты слышишь, а её первая сильная доля ложится на сильную долю уходящей песни. После перехода она плавно возвращается к своей скорости.",
        "Песни, которые не подходят друг к другу, сменяются чистым затуханием, ничего не навязывается.",
      ], None),
      ("Каждый переход — как хочешь ты", [
        "Нажми на любой переход между двумя песнями. Обе волновые формы стоят друг над другом со своими тактами, так что видно, как сходятся биты. Перетащи следующую песню, чтобы сдвинуть её вход на целый такт, и выбери длину: 2, 4, 8 или 16 тактов.",
        "Выбери стиль (Fade, Rise, Blend, Wave, Melt или Slam) или собери свой из трёх настроек: Громкость, EQ (смена баса или смесь трёх полос) и Эффект (развёртка фильтров высоких и низких частот). Все кривые нарисованы на волнах. «Послушать» играет только этот переход, по желанию — с такта до него.",
      ], ("app-mix-list", "Очередь с переходом между каждыми двумя песнями; ближайший подсвечен")),
      ("Темп и тональность каждой песни", [
        "У каждой песни есть BPM и тональность в записи диджеев (8A, 9B…). Редактор подскажет, сочетаются ли две тональности, чтобы ты находил переходы, которые звучат лучше всего.",
      ], None),
      ("Сведи две песни и экспортируй одним файлом", [
        "На главном экране нажми «Свести две песни», выбери два файла и их порядок. У каждой песни остаются своя скорость, эффекты и автоматизации; переход между ними настраиваешь ты. Экспортируй микс одним MP3, он делается на твоём устройстве.",
      ], ("app-mix-two", "Свести две песни: выбери два файла и их порядок")),
      ("Всегда перед глазами", [
        "Карточка «Микс» под плеером показывает ближайший переход: конец этой песни над началом следующей, с кривыми и обратным отсчётом. Нажми на неё, чтобы изменить переход. Не нужен микс между двумя конкретными песнями? Выключи только его, остальные продолжат сводиться.",
      ], ("app-mix-card", "Карточка «Микс»: ближайший переход с его кривыми")),
    ],
    "steps": [
      "Включи песни из библиотеки или плейлиста или нажми «Свести две песни» на главном экране.",
      "Нажми кнопку Микса рядом с экспортом и включи Микс.",
      "Нажми на переход, чтобы его настроить, нажми «Послушать» и экспортируй микс, если нужен файл.",
    ],
    "faq": [
      ("Это бесплатно?", "Да. Без подписки, без аккаунта, без водяных знаков на звуке."),
      ("Биты правда совпадают?", "Когда темпы достаточно близки — да: следующая песня ускоряется или замедляется до 8% и начинается с сильной доли. Если они слишком далеки, будет затухание, а не каша."),
      ("Можно экспортировать микс?", "Да. «Экспорт микса» сводит две песни и переход между ними в один MP3, с их скоростью, эффектами и автоматизациями."),
      ("Работает с замедленными песнями?", "Да. Микс следует за педалью: переход совпадает с темпом, который ты слышишь, а если двигать педаль во время перехода, обе песни остаются в такт."),
      ("Можно убрать переход между двумя песнями?", "Да. Открой этот переход и выбери «Выкл»: эти две песни сыграют одна за другой, остальные переходы останутся."),
      ("Моя музыка куда-то загружается?", "Нет. Темп, тональность и сам микс считаются на твоём устройстве."),
    ],
    "related": ["slow-reverb", "music-library", "audio-editor"],
})

RO.append({
    "slug": "mix-songs",
    "nav": "Mixează melodii",
    "title": "Mixează două melodii online: tranziții DJ gratuite, pe ritm · THE REMIXITY",
    "desc": "Mixează melodii online gratuit: tranziții DJ între melodiile din coadă, cu tempo și ritm potrivite, stiluri de crossfade, EQ și filtre, tonalitățile melodiilor și export a două melodii într-un singur MP3. În browser.",
    "h1": "Mixează melodii ca un DJ, gratuit și în browser",
    "lead": "Pornește Mixul și melodiile din coadă trec una în alta: tempoul se potrivește, bătăile se aliniază, iar fiecare schimbare e o tranziție DJ adevărată, nu un simplu fade. Modelează orice tranziție, ascult-o și exportă două melodii ca un singur mix. Fără abonament, nimic încărcat.",
    "hero": ("app-mix-editor", "Editorul de mix: două melodii una peste alta, bătăile aliniate, curbele tranziției deasupra"),
    "sections": [
      ("Tranziții pe ritm", [
        "THE REMIXITY găsește tempoul și bătaia fiecărei melodii. Când două melodii diferă cu cel mult 8% (sau dublu ori jumătate), următoarea intră în tempoul pe care îl auzi, cu primul timp tare pe un timp tare al melodiei care se termină. După tranziție revine lin la viteza ei.",
        "Melodiile care nu se potrivesc primesc un fade curat, nimic nu e forțat.",
      ], None),
      ("Fiecare tranziție, cum vrei tu", [
        "Atinge orice tranziție dintre două melodii. Ambele forme de undă stau una peste alta, cu măsurile lor, ca să vezi cum se întâlnesc bătăile. Trage melodia următoare ca să muți intrarea, câte o măsură întreagă, și alege lungimea: 2, 4, 8 sau 16 măsuri.",
        "Alege un stil (Fade, Rise, Blend, Wave, Melt sau Slam) sau fă-ți-l din trei controale: Volum, EQ (schimb de bas sau amestec pe 3 benzi) și Efect (filtre trece-sus și trece-jos). Toate curbele sunt desenate pe unde. «Ascultă» redă doar acea tranziție, dacă vrei cu o măsură înainte.",
      ], ("app-mix-list", "Coada ta, cu o tranziție între fiecare două melodii; următoarea e luminată")),
      ("Tempo și tonalitate pentru fiecare melodie", [
        "Fiecare melodie își primește BPM-ul și tonalitatea, scrisă cum o citesc DJ-ii (8A, 9B…). Editorul îți spune dacă două tonalități se potrivesc, ca să găsești tranzițiile care sună cel mai bine.",
      ], None),
      ("Mixează două melodii și exportă-le ca una", [
        "Pe ecranul principal atinge «Mixează două melodii», alege două fișiere și ordinea lor. Fiecare melodie își păstrează viteza, efectele și automatizările; tranziția dintre ele o modelezi tu. Exportă mixul ca un singur MP3, făcut pe dispozitivul tău.",
      ], ("app-mix-two", "Mixează două melodii: alege două fișiere și ordinea lor")),
      ("Mereu la vedere", [
        "Cardul Mix de sub player arată tranziția care urmează: finalul acestei melodii peste începutul următoarei, cu curbele și o numărătoare inversă. Atinge-l ca s-o schimbi. Nu vrei mix între două anumite melodii? Oprește doar acea tranziție, restul se mixează în continuare.",
      ], ("app-mix-card", "Cardul Mix: tranziția care urmează, cu curbele ei")),
    ],
    "steps": [
      "Pornește melodii din bibliotecă sau dintr-un playlist, ori atinge «Mixează două melodii» pe ecranul principal.",
      "Atinge butonul Mix de lângă export și pornește Mixul.",
      "Atinge o tranziție ca s-o modelezi, apasă «Ascultă» și exportă mixul dacă vrei un fișier.",
    ],
    "faq": [
      ("E gratuit?", "Da. Fără abonament, fără cont, fără filigran pe sunet."),
      ("Chiar se aliniază bătăile?", "Când tempourile sunt destul de apropiate, da: următoarea melodie e accelerată sau încetinită cu până la 8% și începe pe un timp tare. Dacă sunt prea diferite, primești un fade, nu o încurcătură."),
      ("Pot exporta un mix?", "Da. «Exportă mixul» face din două melodii și tranziția lor un singur MP3, cu viteza, efectele și automatizările fiecăreia."),
      ("Merge cu melodii încetinite?", "Da. Mixul urmează pedala: tranziția se potrivește cu tempoul pe care îl auzi, iar dacă miști pedala în timpul tranziției, ambele melodii rămân pe ritm."),
      ("Pot sări peste tranziția dintre două melodii?", "Da. Deschide acea tranziție și alege «Oprit»: cele două se cântă una după alta, celelalte tranziții rămân."),
      ("Muzica mea e încărcată undeva?", "Nu. Tempoul, tonalitatea și mixul sunt calculate pe dispozitivul tău."),
    ],
    "related": ["slow-reverb", "music-library", "audio-editor"],
})
