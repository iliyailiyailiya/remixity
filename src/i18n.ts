export type Lang = 'en' | 'ro' | 'ru';

const en = {
  tagline: 'Slowed + reverb and nightcore in your browser. Free, no sign-up, nothing uploaded.',
  pick: 'Choose an audio file',
  pickHint: 'or drop it here · MP3, WAV, FLAC, M4A, OGG',
  loading: 'Decoding…',
  loadError: 'This file could not be decoded. Try another format.',
  presets: 'Presets',
  presetOriginal: 'Original',
  presetSlowed: 'Slowed + Reverb',
  presetUltra: 'Ultra slowed',
  presetNightcore: 'Nightcore',
  tempo: 'Tempo',
  speed: 'Speed',
  pitch: 'Pitch',
  originalBpm: 'Original BPM',
  targetBpm: 'Target BPM',
  tap: 'Tap',
  tapHint: 'Tap along to the beat to find the BPM',
  reverb: 'Reverb',
  mix: 'Mix',
  size: 'Room size',
  tone: 'Tone',
  dark: 'dark',
  bright: 'bright',
  sound: 'Sound',
  bass: 'Bass',
  volume: 'Volume',
  export: 'Export',
  download: 'Download',
  stageResample: 'Changing speed',
  stageRender: 'Applying effects',
  stageEncode: 'Encoding',
  exportError: 'Export failed',
  privacy: 'Your audio is processed on this device and never leaves it.',
  play: 'Play',
  pause: 'Pause',
  st: 'st',
  ct: 'ct',
  eq: 'Equalizer',
  air: 'Air (12 kHz+)',
  lowCut: 'Low cut',
  highCut: 'High cut',
  off: 'off',
  reset: 'Reset',
  effects: 'Effects',
  saturation: 'Saturation',
  echo: 'Echo',
  echoTime: 'Time',
  feedback: 'Repeats',
  save: '+ Save',
  savePrompt: 'Name this preset',
  deletePreset: 'Delete preset',
  marker: 'Marker',
  loop: 'Loop',
  trim: 'Trim',
  cut: 'Cut',
  undo: 'Undo',
  editHint: 'Drag on the waveform to select a part. Trim keeps it, Cut removes it.',
  clearSel: 'Clear selection',
};

type Dict = typeof en;

const ro: Dict = {
  tagline: 'Slowed + reverb și nightcore direct în browser. Gratuit, fără cont, nimic încărcat pe server.',
  pick: 'Alege un fișier audio',
  pickHint: 'sau trage-l aici · MP3, WAV, FLAC, M4A, OGG',
  loading: 'Se decodează…',
  loadError: 'Fișierul nu a putut fi decodat. Încearcă alt format.',
  presets: 'Presetări',
  presetOriginal: 'Original',
  presetSlowed: 'Slowed + Reverb',
  presetUltra: 'Ultra slowed',
  presetNightcore: 'Nightcore',
  tempo: 'Tempo',
  speed: 'Viteză',
  pitch: 'Ton',
  originalBpm: 'BPM original',
  targetBpm: 'BPM țintă',
  tap: 'Bate',
  tapHint: 'Bate în ritm ca să afli BPM-ul',
  reverb: 'Reverb',
  mix: 'Mix',
  size: 'Mărimea camerei',
  tone: 'Timbru',
  dark: 'întunecat',
  bright: 'luminos',
  sound: 'Sunet',
  bass: 'Bas',
  volume: 'Volum',
  export: 'Export',
  download: 'Descarcă',
  stageResample: 'Se schimbă viteza',
  stageRender: 'Se aplică efectele',
  stageEncode: 'Se codează',
  exportError: 'Exportul a eșuat',
  privacy: 'Audio-ul tău e procesat pe acest dispozitiv și nu pleacă de pe el.',
  play: 'Redă',
  pause: 'Pauză',
  st: 'st',
  ct: 'ct',
  eq: 'Egalizator',
  air: 'Aer (12 kHz+)',
  lowCut: 'Tăiere joase',
  highCut: 'Tăiere înalte',
  off: 'oprit',
  reset: 'Resetează',
  effects: 'Efecte',
  saturation: 'Saturație',
  echo: 'Ecou',
  echoTime: 'Timp',
  feedback: 'Repetări',
  save: '+ Salvează',
  savePrompt: 'Numele presetării',
  deletePreset: 'Șterge presetarea',
  marker: 'Marcaj',
  loop: 'Buclă',
  trim: 'Decupaj',
  cut: 'Șterge',
  undo: 'Înapoi',
  editHint: 'Trage pe forma de undă ca să selectezi o parte. „Decupaj” păstrează doar selecția, „Șterge” o elimină.',
  clearSel: 'Șterge selecția',
};

const ru: Dict = {
  tagline: 'Slowed + reverb и nightcore прямо в браузере. Бесплатно, без регистрации, ничего не загружается.',
  pick: 'Выберите аудиофайл',
  pickHint: 'или перетащите сюда · MP3, WAV, FLAC, M4A, OGG',
  loading: 'Декодирование…',
  loadError: 'Не удалось декодировать файл. Попробуйте другой формат.',
  presets: 'Пресеты',
  presetOriginal: 'Оригинал',
  presetSlowed: 'Slowed + Reverb',
  presetUltra: 'Ultra slowed',
  presetNightcore: 'Nightcore',
  tempo: 'Темп',
  speed: 'Скорость',
  pitch: 'Тон',
  originalBpm: 'Исходный BPM',
  targetBpm: 'Целевой BPM',
  tap: 'Тап',
  tapHint: 'Отстукивайте ритм, чтобы узнать BPM',
  reverb: 'Реверб',
  mix: 'Микс',
  size: 'Размер комнаты',
  tone: 'Тембр',
  dark: 'тёмный',
  bright: 'яркий',
  sound: 'Звук',
  bass: 'Бас',
  volume: 'Громкость',
  export: 'Экспорт',
  download: 'Скачать',
  stageResample: 'Изменение скорости',
  stageRender: 'Применение эффектов',
  stageEncode: 'Кодирование',
  exportError: 'Ошибка экспорта',
  privacy: 'Аудио обрабатывается на этом устройстве и никуда не отправляется.',
  play: 'Играть',
  pause: 'Пауза',
  st: 'пт',
  ct: 'ц',
  eq: 'Эквалайзер',
  air: 'Воздух (12 кГц+)',
  lowCut: 'Срез низов',
  highCut: 'Срез верхов',
  off: 'выкл',
  reset: 'Сбросить',
  effects: 'Эффекты',
  saturation: 'Сатурация',
  echo: 'Эхо',
  echoTime: 'Время',
  feedback: 'Повторы',
  save: '+ Сохранить',
  savePrompt: 'Название пресета',
  deletePreset: 'Удалить пресет',
  marker: 'Метка',
  loop: 'Петля',
  trim: 'Обрезать',
  cut: 'Удалить',
  undo: 'Отмена',
  editHint: 'Проведите по волне, чтобы выделить часть. «Обрезать» оставит только её, «Удалить» уберёт.',
  clearSel: 'Снять выделение',
};

const dicts: Record<Lang, Dict> = { en, ro, ru };

let current: Lang = detect();

function detect(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'en' || saved === 'ro' || saved === 'ru') return saved;
  } catch {
    /* storage blocked */
  }
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return nav === 'ro' || nav === 'ru' ? nav : 'en';
}

export const getLang = () => current;
export const t = (key: keyof Dict) => dicts[current][key];

export function setLang(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem('lang', lang);
  } catch {
    /* storage blocked */
  }
  applyI18n();
}

export function applyI18n() {
  document.documentElement.lang = current;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as keyof Dict);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria as keyof Dict));
  });
}
