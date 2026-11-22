// Sharing from the Export sheet: the system share sheet (Web Share API) and
// "Share to SoundCloud" with a review step before anything is posted.

import { t } from '../i18n';
import { makeArtwork } from './artwork';
import * as sc from './soundcloud';

const SITE = 'https://remixity.pages.dev';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface ShareContext {
  /** Render the current remix as MP3 320 (the same path as Export). */
  renderMp3(onProgress: (f: number | null) => void): Promise<Blob>;
  fileName(): string;
  remixTag(): string;
  title(): string;
  artist(): string | null;
  coverSrc(): string;
  lastExport(): { blob: Blob; name: string } | null;
  showSheet(el: HTMLElement): void;
}

const TAGS: Record<string, string> = {
  'slowed + reverb': 'slowed reverb "slowed and reverb" remix remixity',
  slowed: 'slowed remix remixity',
  nightcore: 'nightcore "sped up" remix remixity',
  'sped up': '"sped up" remix remixity',
  reverb: 'reverb remix remixity',
  remix: 'remix remixity',
};

export function initShare(ctx: ShareContext) {
  // ---------- system share sheet ----------
  const webShare = $<HTMLButtonElement>('webShare');
  const refreshWebShare = () => {
    webShare.hidden = typeof navigator.share !== 'function' || !ctx.lastExport();
  };
  webShare.addEventListener('click', async () => {
    const last = ctx.lastExport();
    if (!last) return;
    const file = new File([last.blob], last.name, { type: last.blob.type || 'audio/mpeg' });
    // Share the file itself where the browser can; otherwise share the site.
    const data: ShareData = navigator.canShare?.({ files: [file] })
      ? { files: [file], title: last.name, text: `${t('shareText')} · ${SITE}` }
      : { title: 'THE REMIXITY', text: t('shareText'), url: SITE };
    try {
      await navigator.share(data);
    } catch (err) {
      if ((err as DOMException).name !== 'AbortError') console.warn('share', err);
    }
  });

  // ---------- posting to SoundCloud by hand ----------
  // Until the API app exists, help people who upload the file themselves:
  // copy a ready description (with the site link) and tags.
  const tip = $('scTip');
  const copy = async (btn: HTMLButtonElement, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers: copy through a temporary text field.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    const label = btn.textContent;
    btn.textContent = t('scCopied');
    btn.classList.add('done');
    setTimeout(() => {
      btn.textContent = label;
      btn.classList.remove('done');
    }, 1600);
  };
  $<HTMLButtonElement>('scCopyDesc').addEventListener('click', (e) =>
    copy(e.currentTarget as HTMLButtonElement, t('scDefaultDesc')),
  );
  $<HTMLButtonElement>('scCopyTags').addEventListener('click', (e) =>
    copy(e.currentTarget as HTMLButtonElement, TAGS[ctx.remixTag()] ?? TAGS.remix),
  );

  const refresh = () => {
    refreshWebShare();
    tip.hidden = sc.soundcloudEnabled || !ctx.lastExport();
  };

  // ---------- SoundCloud ----------
  const openBtn = $<HTMLButtonElement>('scOpen');
  openBtn.hidden = !sc.soundcloudEnabled;
  if (!sc.soundcloudEnabled) return { refreshWebShare: refresh, trackChanged: () => {} };

  const sheet = $('scSheet');
  const titleIn = $<HTMLInputElement>('scTrackTitle');
  const descIn = $<HTMLTextAreaElement>('scDesc');
  const tagsIn = $<HTMLInputElement>('scTags');
  const wm = $<HTMLInputElement>('scWatermark');
  const rights = $<HTMLInputElement>('scRights');
  const artImg = $<HTMLImageElement>('scArt');
  const go = $<HTMLButtonElement>('scGo');
  const account = $('scAccount');
  const disconnectBtn = $<HTMLButtonElement>('scDisconnect');
  const progress = $('scProgress');
  const bar = progress.firstElementChild as HTMLElement;
  const status = $('scStatus');
  const result = $<HTMLAnchorElement>('scResult');
  const sharing = () =>
    (document.querySelector('input[name="scSharing"]:checked') as HTMLInputElement).value as 'public' | 'private';

  let filledFor = '';
  let username: string | null = null;
  let busy = false;
  let posted = false;
  let artUrl = '';

  const setStatus = (text: string, error = false) => {
    status.textContent = text;
    status.classList.toggle('error', error);
  };
  const setStage = (label: string, f: number | null) => {
    progress.hidden = false;
    progress.classList.toggle('indeterminate', f === null);
    bar.style.width = `${Math.round((f ?? 0) * 100)}%`;
    setStatus(f === null ? label : `${label} ${Math.round(f * 100)}%`);
  };

  function fill() {
    const artist = ctx.artist();
    const tag = ctx.remixTag();
    titleIn.value = `${artist ? `${artist} - ` : ''}${ctx.title()} (${tag})`.slice(0, 100);
    descIn.value = t('scDefaultDesc');
    tagsIn.value = TAGS[tag] ?? TAGS.remix;
    wm.checked = true;
    rights.checked = false;
    (document.querySelector('input[name="scSharing"][value="private"]') as HTMLInputElement).checked = true;
    filledFor = `${ctx.title()}|${tag}`;
  }

  async function previewArt() {
    const blob = await makeArtwork(ctx.coverSrc(), wm.checked);
    if (artUrl) URL.revokeObjectURL(artUrl);
    artUrl = blob ? URL.createObjectURL(blob) : '';
    artImg.src = artUrl || ctx.coverSrc();
  }

  async function renderAccount() {
    const connected = sc.isConnected();
    if (connected && !username) {
      try {
        username = (await sc.getMe()).username;
      } catch (err) {
        if (err instanceof sc.SoundCloudError && err.status === 401) return renderAccount();
      }
    }
    account.textContent = connected ? `${t('scConnectedAs')} ${username ?? 'SoundCloud'}` : t('scNotConnected');
    disconnectBtn.hidden = !connected;
    go.textContent = connected ? t('scPost') : t('scConnect');
    go.disabled = busy || (connected && posted);
    if (!connected) void sc.prepareConnect();
  }

  function errorText(err: unknown): string {
    if (err instanceof sc.SoundCloudError) {
      const byCode: Record<string, string> = {
        popup_blocked: t('scErrPopup'),
        denied: t('scErrDenied'),
        cancelled: t('scErrCancelled'),
        network: t('scErrNetwork'),
        not_connected: t('scErrExpired'),
        not_configured: t('scErrSetup'),
        not_ready: t('scErrSetup'),
      };
      if (byCode[err.message]) return byCode[err.message];
      if (err.status === 404 || err.status === 503) return t('scErrSetup'); // token function missing/unconfigured
      if (['bad_state', 'token_failed', 'token_exchange_failed', 'invalid_grant', 'forbidden', 'bad_request'].includes(err.message))
        return t('scErrConnect');
      if (err.status === 401) return t('scErrExpired');
      if (err.status === 429) return t('scErrBusy');
      if (err.status === 503) return t('scErrSetup');
      return `${t('scErrOther')}: ${err.message}`;
    }
    if (err instanceof TypeError) return t('scErrNetwork'); // fetch couldn't connect
    return `${t('scErrOther')}: ${(err as Error).message}`;
  }

  openBtn.addEventListener('click', () => {
    const key = `${ctx.title()}|${ctx.remixTag()}`;
    if (key !== filledFor) {
      fill();
      posted = false;
      result.hidden = true;
      progress.hidden = true;
      setStatus('');
    }
    void previewArt();
    void renderAccount();
    ctx.showSheet(sheet);
  });

  wm.addEventListener('change', () => void previewArt());
  $('scDescClear').addEventListener('click', () => {
    descIn.value = '';
    descIn.focus();
  });
  disconnectBtn.addEventListener('click', async () => {
    await sc.disconnect();
    username = null;
    void renderAccount();
  });

  go.addEventListener('click', async () => {
    if (busy) return;
    if (!sc.isConnected()) {
      // connect() must open its window right inside this tap.
      try {
        await sc.connect();
        username = null;
        setStatus('');
      } catch (err) {
        setStatus(errorText(err), true);
      }
      void renderAccount();
      return;
    }

    const fields: sc.TrackFields = {
      title: titleIn.value.trim(),
      description: descIn.value.trim(),
      tags: tagsIn.value.trim(),
      sharing: sharing(),
    };
    if (!fields.title) return setStatus(t('scNeedTitle'), true), titleIn.focus();
    if (!rights.checked) return setStatus(t('scNeedRights'), true);

    busy = true;
    go.disabled = true;
    result.hidden = true;
    const notes: string[] = [];
    try {
      const blob = await ctx.renderMp3((f) => setStage(t('scStageRender'), f));
      const audio = new File([blob], ctx.fileName(), { type: 'audio/mpeg' });
      const art = await makeArtwork(ctx.coverSrc(), wm.checked);
      const onUp = (f: number) => setStage(t('scStageUpload'), f);

      let track: sc.Track;
      try {
        track = await sc.uploadTrack(fields, audio, art, onUp);
      } catch (err) {
        // Artwork can be refused (e.g. for some account types): post without it.
        const retry =
          art && err instanceof sc.SoundCloudError && err.status >= 400 && err.status < 500 && ![401, 429].includes(err.status);
        if (!retry) throw err;
        track = await sc.uploadTrack(fields, audio, null, onUp);
        notes.push(t('scNoArtwork'));
      }

      setStage(t('scStagePlaylist'), null);
      try {
        await sc.addToPlaylist(track);
      } catch (err) {
        console.warn('playlist', err instanceof Error ? err.message : err);
        notes.push(t('scNoPlaylist'));
      }

      posted = true;
      progress.hidden = true;
      if (fields.sharing === 'private') notes.unshift(t('scDonePrivate'));
      setStatus([t('scDone'), ...notes].join(' '));
      result.href = track.permalink_url;
      result.hidden = !track.permalink_url;
    } catch (err) {
      progress.hidden = true;
      setStatus(errorText(err), true);
    } finally {
      busy = false;
      void renderAccount();
    }
  });

  return {
    refreshWebShare: refresh,
    /** A new song was loaded: start the review fresh next time. */
    trackChanged: () => {
      filledFor = '';
    },
  };
}
