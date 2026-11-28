// What the first-time tips say, in each language (src/ui/tour.ts shows them).

import type { Labels, Step } from './tour';

type Tours = Record<string, Step[]>;
const s = (target: string | null, title: string, text: string): Step => ({ target, title, text });

const EN: Tours = {
  welcome: [
    s(null, 'Welcome to THE REMIXITY', 'Slow songs down, add reverb, read the lyrics, mix songs like a DJ and make Stories. Everything happens on this device: your music is never uploaded.'),
    s('label[for="file"]', 'Start with a song', 'Pick any song from your phone or computer: MP3, WAV, FLAC, M4A and more.'),
    s('#openLibraryHome', 'Your library', 'Keep your songs here, sorted by artist, in playlists. Play them in a row like a music app.'),
    s('#mixTwoHome', 'Mix two songs', 'Choose two songs and blend one into the other like a DJ, then export the mix.'),
  ],
  player: [
    s('#coverFrame', 'The cover', 'Find a better cover, choose your own picture, or blur it with the buttons on top.'),
    s('#editInfo', 'Title and artist', 'Tap to fix the song’s name and artist. They go into the file you export.'),
    s('#bar', 'Where you are', 'Tap or drag to jump. The badge under it shows your remix: Original, Slowed ×0.85…'),
    s('#repeatBtn', 'Repeat', 'Play this song again and again, without a gap.'),
    s('#openTimeline', 'Timeline', 'Move whole sections of the song and draw automation: the speed, reverb, echo and EQ changing over time. Works with your phone sideways.'),
    s('#openMix', 'Mix', 'Turn on Mix and your songs blend into each other like a DJ set, with the beats lined up.'),
    s('#openExport', 'Save or share', 'Export your remix as MP3 or WAV, or make an Instagram Story with it.'),
    s('#openMenu', 'More', 'Presets, bass and boost, covers and lyrics settings, and this tutorial again.'),
    s('#pages', 'Swipe these cards', 'Lyrics, the speed pedal, reverb and echo, EQ, cutting, and Mix. Swipe sideways or use the dots.'),
  ],
  'page-lyrics': [s('.page-lyrics', 'Lyrics', 'Synced to the song when they’re found. Tap them to read along full screen, tap a line to jump there.')],
  'page-drive': [
    s('#pedal', 'The pedal', 'Down to slow the song, up to speed it up. The reverb follows it by itself.'),
    s('#keepPitchBtn', 'Keep pitch', 'Change the speed without changing the key of the song.'),
    s('#lockSpeedBtn', 'Lock', 'Keep this speed for the next songs too.'),
  ],
  'page-space': [s('.page-space', 'Reverb and echo', 'Set the room’s size and tone and add an echo. With “Follows the pedal” on, the reverb sets itself from the speed.')],
  'page-eq': [s('#eqCanvas', 'Equalizer', 'Drag the five points up or down to shape the sound: bass on the left, air on the right. Behind them you see what’s playing.')],
  'page-chop': [s('.page-chop', 'Cut and loop', 'Select a part on the waveform, then loop it, keep only it, or cut it out. Markers help you find your way.')],
  'page-mix': [s('#mixMini', 'The next transition', 'The end of this song over the start of the next, with the transition’s curves. Tap it to change how they blend.')],
  mixSheet: [
    s('.mix-head .switch', 'Mix on or off', 'When it’s on, every song in your queue blends into the next.'),
    s('.mix-link.live .mix-pill', 'A transition', 'Each pill is the change from one song to the next. Auto lets the app decide; tap it to make it your own or switch it off.'),
  ],
  mixEdit: [
    s('#mixCanvas', 'Two songs, stacked', 'This song’s end on top, the next one’s start below. Green lines are the bars: when they meet, the beats are in sync. Drag sideways to move the transition.'),
    s('.mix-hear', 'Hear it', 'Plays just this transition, from the mix or one bar before. Tap again to stop.'),
    s('#mixLen', 'Length', 'How many bars the two songs overlap. Sync beats matches their tempos when they’re close enough.'),
    s('#mixPresets', 'Style', 'Ready-made transitions. Off means no transition between these two songs.'),
    s('#mixTabs', 'Volume, EQ, Effect', 'The three parts of a style: how loud each song is, which frequencies swap, which filter sweeps. The curves are drawn above.'),
    s('#mixExport', 'Export the mix', 'Both songs and the transition as one MP3.'),
  ],
  timeline: [
    s('#tlCanvas', 'Your song, in sections', 'Drag a section to move it. Tap a lane to open it big; double-tap there to add a point.'),
    s('#tlSplit', 'Split', 'Cut the song into sections at the playhead.'),
    s('#tlAddLane', 'Automation', 'Add a lane for the speed, reverb, echo or EQ (up to five), then draw how it changes.'),
    s('#tlGrid', 'Grid', 'Points and splits snap to the song’s bars and beats.'),
    s('#tlUndo', 'Undo', 'Every change can be undone.'),
  ],
  library: [
    s('#libTabs', 'Songs, artists, playlists', 'Your music sorted three ways.'),
    s('label[for="libFiles"].icon-btn', 'Add songs', 'Pick songs (or a whole folder) to keep them here. They stay on this device.'),
    s('#libFix', 'Fix my library', 'Cleans up names, finds covers and sorts out artists for you.'),
    s('#libPlayAll', 'Play', 'Play everything in a row, or shuffle.'),
  ],
  export: [
    s('#exportSheet .sheet-body', 'Save your remix', 'Choose MP3 or WAV, check the name, title and cover, then download or share.'),
    s('#openStory', 'Make a Story', 'A picture or a video of your song for Instagram, with the cover, lyrics and your remix playing.'),
  ],
  story: [
    s('#storyStyles', 'Pick a look', 'Card, full cover, vinyl, lyrics or waves.'),
    s('#storyCreate', 'Create', 'Makes the image or video on your device. Then share it straight to your Story.'),
  ],
};

const RO: Tours = {
  welcome: [
    s(null, 'Bine ai venit în THE REMIXITY', 'Încetinește melodii, adaugă reverb, citește versurile, mixează ca un DJ și fă story-uri. Totul se întâmplă pe acest dispozitiv: muzica ta nu e încărcată nicăieri.'),
    s('label[for="file"]', 'Începe cu o melodie', 'Alege orice melodie de pe telefon sau calculator: MP3, WAV, FLAC, M4A și altele.'),
    s('#openLibraryHome', 'Biblioteca ta', 'Păstrează-ți melodiile aici, pe artiști și în playlisturi. Ascultă-le una după alta, ca într-o aplicație de muzică.'),
    s('#mixTwoHome', 'Mixează două melodii', 'Alege două melodii și trece una în alta ca un DJ, apoi exportă mixul.'),
  ],
  player: [
    s('#coverFrame', 'Coperta', 'Caută o copertă mai bună, alege o poză a ta sau estompeaz-o cu butoanele de sus.'),
    s('#editInfo', 'Titlu și artist', 'Atinge ca să corectezi numele melodiei și artistul. Ajung în fișierul exportat.'),
    s('#bar', 'Unde ești', 'Atinge sau trage ca să sari. Eticheta de dedesubt arată remixul: Original, Încetinit ×0.85…'),
    s('#repeatBtn', 'Repetă', 'Ascultă melodia iar și iar, fără pauză.'),
    s('#openTimeline', 'Cronologie', 'Mută secțiuni întregi și desenează automatizări: viteza, reverbul, ecoul și EQ-ul schimbându-se în timp. Merge cu telefonul pe orizontală.'),
    s('#openMix', 'Mix', 'Pornește Mixul și melodiile trec una în alta ca un set de DJ, cu bătăile aliniate.'),
    s('#openExport', 'Salvează sau distribuie', 'Exportă remixul ca MP3 sau WAV ori fă un story pentru Instagram.'),
    s('#openMenu', 'Mai multe', 'Preseturi, bas și amplificare, setări pentru coperte și versuri și din nou acest tutorial.'),
    s('#pages', 'Glisează cardurile', 'Versuri, pedala de viteză, reverb și ecou, EQ, tăiere și Mix. Glisează lateral sau folosește punctele.'),
  ],
  'page-lyrics': [s('.page-lyrics', 'Versuri', 'Sincronizate cu melodia când sunt găsite. Atinge-le ca să le citești pe tot ecranul; atinge un vers ca să sari acolo.')],
  'page-drive': [
    s('#pedal', 'Pedala', 'În jos ca să încetinești melodia, în sus ca s-o accelerezi. Reverbul o urmează singur.'),
    s('#keepPitchBtn', 'Păstrează tonul', 'Schimbă viteza fără să schimbi tonalitatea.'),
    s('#lockSpeedBtn', 'Blochează', 'Păstrează această viteză și pentru următoarele melodii.'),
  ],
  'page-space': [s('.page-space', 'Reverb și ecou', 'Reglează mărimea și tonul sălii și adaugă ecou. Cu „urmează pedala” pornit, reverbul se setează singur după viteză.')],
  'page-eq': [s('#eqCanvas', 'Egalizator', 'Trage cele cinci puncte în sus sau în jos ca să modelezi sunetul: basul în stânga, „aerul” în dreapta. În spate vezi ce se aude.')],
  'page-chop': [s('.page-chop', 'Taie și buclează', 'Selectează o parte pe formă de undă, apoi pune-o în buclă, păstreaz-o doar pe ea sau taie-o. Marcajele te ajută să te orientezi.')],
  'page-mix': [s('#mixMini', 'Următoarea tranziție', 'Finalul acestei melodii peste începutul următoarei, cu curbele tranziției. Atinge ca să schimbi cum se amestecă.')],
  mixSheet: [
    s('.mix-head .switch', 'Mix pornit sau oprit', 'Când e pornit, fiecare melodie din coadă trece în următoarea.'),
    s('.mix-link.live .mix-pill', 'O tranziție', 'Fiecare pastilă e trecerea de la o melodie la următoarea. Auto lasă aplicația să decidă; atinge ca s-o faci a ta sau s-o oprești.'),
  ],
  mixEdit: [
    s('#mixCanvas', 'Două melodii, una peste alta', 'Finalul acestei melodii sus, începutul următoarei jos. Liniile verzi sunt măsurile: când se întâlnesc, bătăile sunt sincronizate. Trage lateral ca să muți tranziția.'),
    s('.mix-hear', 'Ascultă', 'Redă doar această tranziție, de la mix sau cu o măsură înainte. Atinge din nou ca s-o oprești.'),
    s('#mixLen', 'Lungime', 'Câte măsuri se suprapun melodiile. Sincronizarea potrivește tempourile când sunt destul de apropiate.'),
    s('#mixPresets', 'Stil', 'Tranziții gata făcute. Oprit înseamnă fără tranziție între aceste două melodii.'),
    s('#mixTabs', 'Volum, EQ, Efect', 'Cele trei părți ale unui stil: cât de tare e fiecare melodie, ce frecvențe se schimbă, ce filtru se mișcă. Curbele sunt desenate deasupra.'),
    s('#mixExport', 'Exportă mixul', 'Ambele melodii și tranziția într-un singur MP3.'),
  ],
  timeline: [
    s('#tlCanvas', 'Melodia ta, pe secțiuni', 'Trage o secțiune ca s-o muți. Atinge o bandă ca s-o deschizi mare; atinge de două ori acolo ca să adaugi un punct.'),
    s('#tlSplit', 'Împarte', 'Taie melodia în secțiuni în dreptul cursorului.'),
    s('#tlAddLane', 'Automatizare', 'Adaugă o bandă pentru viteză, reverb, ecou sau EQ (până la cinci), apoi desenează cum se schimbă.'),
    s('#tlGrid', 'Grilă', 'Punctele și tăieturile se prind de măsurile și bătăile melodiei.'),
    s('#tlUndo', 'Anulează', 'Orice schimbare poate fi anulată.'),
  ],
  library: [
    s('#libTabs', 'Melodii, artiști, playlisturi', 'Muzica ta, sortată în trei feluri.'),
    s('label[for="libFiles"].icon-btn', 'Adaugă melodii', 'Alege melodii (sau un folder întreg) ca să le păstrezi aici. Rămân pe acest dispozitiv.'),
    s('#libFix', 'Repară biblioteca', 'Curăță numele, găsește coperte și ordonează artiștii pentru tine.'),
    s('#libPlayAll', 'Redă', 'Ascultă tot pe rând sau amestecat.'),
  ],
  export: [
    s('#exportSheet .sheet-body', 'Salvează remixul', 'Alege MP3 sau WAV, verifică numele, titlul și coperta, apoi descarcă sau distribuie.'),
    s('#openStory', 'Fă un story', 'O imagine sau un video cu melodia ta pentru Instagram, cu coperta, versurile și remixul tău.'),
  ],
  story: [
    s('#storyStyles', 'Alege un aspect', 'Card, copertă întreagă, vinil, versuri sau valuri.'),
    s('#storyCreate', 'Creează', 'Face imaginea sau video-ul pe dispozitivul tău. Apoi îl distribui direct în story.'),
  ],
};

const RU: Tours = {
  welcome: [
    s(null, 'Добро пожаловать в THE REMIXITY', 'Замедляй песни, добавляй реверб, читай тексты, своди треки как диджей и делай сторис. Всё происходит на этом устройстве: твоя музыка никуда не загружается.'),
    s('label[for="file"]', 'Начни с песни', 'Выбери любую песню на телефоне или компьютере: MP3, WAV, FLAC, M4A и другие.'),
    s('#openLibraryHome', 'Твоя библиотека', 'Храни песни здесь, по исполнителям и в плейлистах. Слушай их подряд, как в музыкальном приложении.'),
    s('#mixTwoHome', 'Свести две песни', 'Выбери две песни и сведи одну в другую как диджей, потом экспортируй микс.'),
  ],
  player: [
    s('#coverFrame', 'Обложка', 'Найди обложку получше, выбери свою картинку или размой её кнопками сверху.'),
    s('#editInfo', 'Название и исполнитель', 'Нажми, чтобы исправить название и исполнителя. Они попадут в экспортированный файл.'),
    s('#bar', 'Где ты сейчас', 'Нажми или потяни, чтобы перейти. Метка под полосой показывает ремикс: Оригинал, Замедлено ×0.85…'),
    s('#repeatBtn', 'Повтор', 'Песня играет снова и снова, без паузы.'),
    s('#openTimeline', 'Таймлайн', 'Двигай целые части песни и рисуй автоматизации: скорость, реверб, эхо и EQ, меняющиеся во времени. Работает, когда телефон повёрнут боком.'),
    s('#openMix', 'Микс', 'Включи Микс, и песни будут перетекать друг в друга как диджей-сет, с совпадающими битами.'),
    s('#openExport', 'Сохранить или поделиться', 'Экспортируй ремикс в MP3 или WAV или сделай сторис для Instagram.'),
    s('#openMenu', 'Ещё', 'Пресеты, бас и громкость, настройки обложек и текстов и снова это обучение.'),
    s('#pages', 'Листай карточки', 'Текст, педаль скорости, реверб и эхо, EQ, нарезка и Микс. Листай вбок или нажимай на точки.'),
  ],
  'page-lyrics': [s('.page-lyrics', 'Текст', 'Синхронизирован с песней, когда найден. Нажми, чтобы читать на весь экран; нажми на строку, чтобы перейти к ней.')],
  'page-drive': [
    s('#pedal', 'Педаль', 'Вниз — замедлить песню, вверх — ускорить. Реверб подстраивается сам.'),
    s('#keepPitchBtn', 'Сохранить тон', 'Меняй скорость, не меняя тональность.'),
    s('#lockSpeedBtn', 'Закрепить', 'Оставить эту скорость и для следующих песен.'),
  ],
  'page-space': [s('.page-space', 'Реверб и эхо', 'Настрой размер и тон зала и добавь эхо. Когда «следует за педалью» включено, реверб сам подстраивается под скорость.')],
  'page-eq': [s('#eqCanvas', 'Эквалайзер', 'Тяни пять точек вверх или вниз, чтобы менять звук: бас слева, «воздух» справа. За ними видно, что сейчас играет.')],
  'page-chop': [s('.page-chop', 'Нарезка и петля', 'Выдели часть на волне и зацикли её, оставь только её или вырежи. Метки помогают ориентироваться.')],
  'page-mix': [s('#mixMini', 'Следующий переход', 'Конец этой песни над началом следующей, с кривыми перехода. Нажми, чтобы изменить, как они смешиваются.')],
  mixSheet: [
    s('.mix-head .switch', 'Микс вкл/выкл', 'Когда он включён, каждая песня в очереди перетекает в следующую.'),
    s('.mix-link.live .mix-pill', 'Переход', 'Каждая плашка — смена одной песни на следующую. «Авто» — решает приложение; нажми, чтобы настроить его сам или выключить.'),
  ],
  mixEdit: [
    s('#mixCanvas', 'Две песни друг над другом', 'Сверху конец этой песни, снизу начало следующей. Зелёные линии — такты: когда они совпадают, биты синхронны. Тяни вбок, чтобы сдвинуть переход.'),
    s('.mix-hear', 'Послушать', 'Играет только этот переход — с микса или с такта до него. Нажми ещё раз, чтобы остановить.'),
    s('#mixLen', 'Длина', 'Сколько тактов песни звучат вместе. «Синхр. биты» подгоняет темпы, если они достаточно близки.'),
    s('#mixPresets', 'Стиль', 'Готовые переходы. «Выкл» — без перехода между этими двумя песнями.'),
    s('#mixTabs', 'Громкость, EQ, Эффект', 'Три части стиля: насколько громка каждая песня, какие частоты меняются, какой фильтр двигается. Кривые нарисованы сверху.'),
    s('#mixExport', 'Экспорт микса', 'Обе песни и переход одним MP3.'),
  ],
  timeline: [
    s('#tlCanvas', 'Песня по частям', 'Перетащи часть, чтобы её сдвинуть. Нажми на дорожку, чтобы открыть её крупно; двойное нажатие добавляет точку.'),
    s('#tlSplit', 'Разрезать', 'Режет песню на части в месте курсора.'),
    s('#tlAddLane', 'Автоматизация', 'Добавь дорожку скорости, реверба, эха или EQ (до пяти) и нарисуй, как она меняется.'),
    s('#tlGrid', 'Сетка', 'Точки и разрезы прилипают к тактам и долям песни.'),
    s('#tlUndo', 'Отменить', 'Любое изменение можно отменить.'),
  ],
  library: [
    s('#libTabs', 'Песни, исполнители, плейлисты', 'Твоя музыка, разложенная тремя способами.'),
    s('label[for="libFiles"].icon-btn', 'Добавить песни', 'Выбери песни (или целую папку), чтобы хранить их здесь. Они остаются на этом устройстве.'),
    s('#libFix', 'Починить библиотеку', 'Приводит в порядок названия, находит обложки и разбирает исполнителей.'),
    s('#libPlayAll', 'Играть', 'Слушать всё подряд или вперемешку.'),
  ],
  export: [
    s('#exportSheet .sheet-body', 'Сохрани ремикс', 'Выбери MP3 или WAV, проверь имя, название и обложку, потом скачай или поделись.'),
    s('#openStory', 'Сделать сторис', 'Картинка или видео с твоей песней для Instagram: обложка, текст и твой ремикс.'),
  ],
  story: [
    s('#storyStyles', 'Выбери вид', 'Карточка, обложка на весь экран, винил, текст или волны.'),
    s('#storyCreate', 'Создать', 'Делает картинку или видео на твоём устройстве. Потом поделись сразу в сторис.'),
  ],
};

const LABELS: Record<string, Labels> = {
  en: { next: 'Next', done: 'Got it', skip: 'Skip', stepOf: (i, n) => `${i} of ${n}` },
  ro: { next: 'Înainte', done: 'Am înțeles', skip: 'Sari peste', stepOf: (i, n) => `${i} din ${n}` },
  ru: { next: 'Далее', done: 'Понятно', skip: 'Пропустить', stepOf: (i, n) => `${i} из ${n}` },
};

export function tourText(lang: string): { tours: Tours; labels: Labels } {
  const tours = lang === 'ro' ? RO : lang === 'ru' ? RU : EN;
  return { tours, labels: LABELS[lang] ?? LABELS.en };
}
