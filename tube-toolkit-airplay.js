// ==UserScript==
// @name         Tube Video Toolkit (iOS) — AirPlay Previews
// @namespace    https://github.com/local/tube-video-toolkit
// @version      1.2.0
// @description  iPhone/iPad Safari — AirPlay previews + save, library, cloud sync
// @author       cameroncohen
// @match        *://*.xhamster.com/*
// @match        *://*.pornhub.com/*
// @match        *://*.xvideos.com/*
// @match        *://*.gaymaletube.com/*
// @match        *://*.gayxxxnews.com/*
// @match        *://*.gayporn.com/*
// @match        *://*.nakedsword.com/*
// @match        *://*.faphouse.com/*
// @match        *://*.rawfuckclub.com/*
// @match        *://*.xnxx.com/*
// @match        *://*.spankbang.com/*
// @match        *://*.youporngay.com/*
// @match        *://*.boyfriendtv.com/*
// @match        *://*.boyfriend.tv/*
// @match        *://*.x.com/*
// @match        *://*.xnxx.com/*
// @match        *://*.faphouse.com/*
// @match        *://*.youporngay.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_setClipboard
// @connect      api.github.com
// @connect      gist.githubusercontent.com
// @connect      localhost
// @connect      127.0.0.1
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'tvt_saved_videos';
  const CONFIG_KEY = 'tvt_cloud_config';
  const SERVER_KEY = 'tvt_download_server';
  const SETTINGS_KEY = 'tvt_ios_settings';
  const STYLE_ID = 'tvt-ios-style';
  const SETTINGS_DEFAULTS = {
    soundMain: true,
    soundPreviews: true,
    volume: 0.01,
    lockVolume: true,
    airPlay: true,
    nativeControls: true,
    hideAds: true,
    clickSkip: true,
    showSelect: true,
    showSave: true,
    showLibrary: true,
  };
  const AD_OVERLAY_SELECTORS = [
    '.ads-wrapper', '.ad-overlay', '.video_ad_container', '.adplayer', '.adPlayer',
    '#adContainer', '.ad-wrapper', '.ad-content', '.ad-modal', '.ad-popup',
    '[data-adtype]', '[class*="preroll"]', '[class*="videoAd"]', '[id*="video_ad"]',
    '[class*="xHamsterAd"]', '[class*="PHAd"]', '[class*="XVideosAd"]',
  ];

  let selectMode = false;
  const selectedPreviews = new Set();
  let queueClips = [];
  let queueIndex = 0;
  let lastEnhanceTime = 0;
  let lastHideAdsTime = 0;

  const MAIN_HINTS = [
    'video#mainVideo', '#player video', '#video-player video', '#video_player video',
    '.player video', '.video-player video', '.main-video video', 'video.vjs-tech',
    'video.fp-engine', 'video[data-video-type="main"]',
  ];

  function loadList() {
    try {
      const list = JSON.parse(GM_getValue(STORAGE_KEY, '[]'));
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function saveList(list) {
    GM_setValue(STORAGE_KEY, JSON.stringify(list));
  }

  function loadCloudConfig() {
    try {
      return Object.assign(
        { token: '', gistId: '', filename: 'tube-videos.json' },
        JSON.parse(GM_getValue(CONFIG_KEY, '{}'))
      );
    } catch {
      return { token: '', gistId: '', filename: 'tube-videos.json' };
    }
  }

  function saveCloudConfig(cfg) {
    GM_setValue(CONFIG_KEY, JSON.stringify(cfg));
  }

  function downloadServer() {
    return String(GM_getValue(SERVER_KEY, '')).replace(/\/$/, '');
  }

  function downloadToken() {
    return String(GM_getValue('tvt_download_token', '')).trim();
  }

  function loadSettings() {
    try {
      const next = Object.assign({}, SETTINGS_DEFAULTS, JSON.parse(GM_getValue(SETTINGS_KEY, '{}')));
      const vol = Number(next.volume);
      next.volume = Number.isFinite(vol) ? Math.min(1, Math.max(0.01, vol)) : SETTINGS_DEFAULTS.volume;
      return next;
    } catch {
      return Object.assign({}, SETTINGS_DEFAULTS);
    }
  }

  function saveSettings(partial) {
    const next = Object.assign(loadSettings(), partial || {});
    const vol = Number(next.volume);
    next.volume = Number.isFinite(vol) ? Math.min(1, Math.max(0.01, vol)) : SETTINGS_DEFAULTS.volume;
    GM_setValue(SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  function minVolume() {
    return loadSettings().volume;
  }

  function applySettingsLive() {
    enhanceVideos();
    refreshFab();
    hideAdOverlays();
  }

  function gmRequest(opts) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        ...opts,
        onload: resolve,
        onerror: reject,
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  function githubHeaders(token, extra) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      ...extra,
    };
  }

  function parseGistItems(parsed) {
    return Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
  }

  async function gistFileContent(fileMeta, token) {
    if (!fileMeta) return '';
    let content = fileMeta.content;
    if (fileMeta.truncated && fileMeta.raw_url) {
      const raw = await gmRequest({
        method: 'GET',
        url: fileMeta.raw_url,
        headers: githubHeaders(token),
      });
      if (raw.status >= 200 && raw.status < 300) content = raw.responseText;
    }
    return content || '';
  }

  function notify(text) {
    try {
      GM_notification({ title: 'Tube Toolkit', text, timeout: 2200 });
    } catch {
      console.log('[TVT]', text);
    }
  }

  function uid() {
    return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function canonicalize(url) {
    try {
      const u = new URL(url);
      u.hash = '';
      ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'].forEach((k) => u.searchParams.delete(k));
      return u.toString();
    } catch {
      return url;
    }
  }

  function pageTitle() {
    return (document.title || location.hostname).replace(/\s+/g, ' ').trim().slice(0, 180);
  }

  function pageThumb() {
    return document.querySelector('meta[property="og:image"]')?.content || '';
  }

  function isProbablyPreview(video) {
    const r = video.getBoundingClientRect();
    const small = r.width > 0 && r.width < 280;
    const inThumb = !!video.closest('[class*="thumb"], [class*="preview"], [class*="trailer"], [data-preview], .thumb, .preview');
    return inThumb || (small && (video.muted || video.hasAttribute('muted')));
  }

  function isMainVideo(video) {
    if (MAIN_HINTS.some((s) => {
      try {
        return video.matches(s) || video.closest(s);
      } catch {
        return false;
      }
    })) {
      return !isProbablyPreview(video);
    }
    const r = video.getBoundingClientRect();
    return r.width >= 280 && r.height >= 160 && !isProbablyPreview(video);
  }

  function containsMainVideo(el) {
    return !!el.querySelector?.('video') && [...el.querySelectorAll('video')].some(isMainVideo);
  }

  function findMainVideo() {
    return (
      [...document.querySelectorAll('video')]
        .filter(isMainVideo)
        .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0] || null
    );
  }

  function bestSrc(video) {
    return video?.currentSrc || video?.src || video?.querySelector('source[src]')?.src || '';
  }

  function mergeLists(remote, local) {
    const map = new Map();
    [...(remote || []), ...(local || [])].forEach((item) => {
      if (!item?.url) return;
      const key = canonicalize(item.url);
      const prev = map.get(key);
      if (!prev || String(item.savedAt || '') >= String(prev.savedAt || '')) {
        map.set(key, item);
      }
    });
    return [...map.values()].sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
  }

  async function pushToGist(list) {
    const cfg = loadCloudConfig();
    if (!cfg.token) return null;
    let items = Array.isArray(list) ? list : [];
    if (cfg.gistId) {
      try {
        items = mergeLists(await pullFromGist(), items);
        saveList(items);
      } catch {}
    }
    const body = {
      description: 'Tube Video Toolkit saved links',
      public: false,
      files: {
        [cfg.filename]: {
          content: JSON.stringify({ updatedAt: new Date().toISOString(), items }, null, 2),
        },
      },
    };
    const gistHeaders = githubHeaders(cfg.token, { 'Content-Type': 'application/json' });
    if (cfg.gistId) {
      const res = await gmRequest({
        method: 'PATCH',
        url: `https://api.github.com/gists/${cfg.gistId}`,
        headers: gistHeaders,
        data: JSON.stringify(body),
      });
      if (res.status < 200 || res.status >= 300) throw new Error(`Gist update ${res.status}`);
      return cfg.gistId;
    }
    const res = await gmRequest({
      method: 'POST',
      url: 'https://api.github.com/gists',
      headers: gistHeaders,
      data: JSON.stringify(body),
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`Gist create ${res.status}`);
    const data = JSON.parse(res.responseText);
    cfg.gistId = data.id;
    saveCloudConfig(cfg);
    return data.id;
  }

  async function pullFromGist() {
    const cfg = loadCloudConfig();
    if (!cfg.token || !cfg.gistId) throw new Error('Configure cloud sync first');
    const res = await gmRequest({
      method: 'GET',
      url: `https://api.github.com/gists/${cfg.gistId}`,
      headers: githubHeaders(cfg.token),
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`Gist fetch ${res.status}`);
    const data = JSON.parse(res.responseText);
    const fileMeta = data.files?.[cfg.filename] || Object.values(data.files || {})[0];
    const content = await gistFileContent(fileMeta, cfg.token);
    if (!content) return [];
    return parseGistItems(JSON.parse(content));
  }

  async function saveCurrentPage() {
    const url = canonicalize(location.href);
    let list = loadList();
    if (list.some((i) => canonicalize(i.url) === url)) {
      notify('Already saved');
      return;
    }
    const video = findMainVideo();
    list = [
      {
        id: uid(),
        url,
        title: pageTitle(),
        thumb: pageThumb(),
        site: location.hostname.replace(/^www\./, ''),
        mediaUrl: bestSrc(video),
        savedAt: new Date().toISOString(),
      },
      ...list,
    ];
    saveList(list);
    notify('Saved');
    try {
      const id = await pushToGist(list);
      if (!id) notify('Saved locally — set GitHub token in Config to sync');
    } catch (err) {
      console.warn(err);
      notify('Saved locally — cloud sync failed');
    }
    updateFabState();
  }

  async function queueDownload(item) {
    const base = downloadServer();
    if (!base || /127\.0\.0\.1|localhost/i.test(base)) {
      throw new Error('Set Mac download server in Config to your Mac LAN URL.');
    }
    const headers = { 'Content-Type': 'application/json' };
    const token = downloadToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await gmRequest({
      method: 'POST',
      url: `${base}/api/download`,
      headers,
      data: JSON.stringify({ url: item.url, title: item.title, itemId: item.id }),
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(res.responseText || `Download server ${res.status}`);
    }
  }

  function injectCSS() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = `
      video { -webkit-playsinline: true; }
      video::-webkit-media-controls { display: flex !important; }
      video::-webkit-media-controls-overlay-play-button { display: none !important; }
      video::-webkit-media-controls-wireless-playback-picker-button { display: inline-block !important; }
      #tvt-ios-fab {
        position: fixed; right: max(12px, env(safe-area-inset-right));
        bottom: max(18px, env(safe-area-inset-bottom)); z-index: 2147483646;
        display: flex; flex-direction: column; gap: 8px;
      }
      #tvt-ios-fab button {
        border: 0; border-radius: 999px; padding: 12px 14px;
        background: rgba(0,0,0,.82); color: #fff;
        font: 650 13px/1 -apple-system, system-ui, sans-serif;
        box-shadow: 0 8px 24px rgba(0,0,0,.35);
      }
      #tvt-ios-fab button.saved { background: #1f6f43; }
      #tvt-library {
        position: fixed; inset: 0; z-index: 2147483647;
        background: rgba(8,10,14,.96); color: #f2f4f8;
        font: 14px/1.4 -apple-system, system-ui, sans-serif;
        display: flex; flex-direction: column; padding-top: env(safe-area-inset-top);
      }
      #tvt-library header {
        display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
        padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,.08);
      }
      #tvt-library h1 { font-size: 17px; margin: 0; flex: 1 1 auto; }
      #tvt-library input[type="search"] {
        flex: 1 1 100%; padding: 10px 12px; border-radius: 10px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.06); color: inherit;
      }
      #tvt-library header button {
        padding: 8px 10px; border: 0; border-radius: 10px;
        background: rgba(255,255,255,.12); color: inherit;
      }
      #tvt-library .tvt-body {
        overflow: auto; padding: 12px; display: grid; gap: 12px;
        padding-bottom: max(24px, env(safe-area-inset-bottom));
      }
      #tvt-library .tvt-card {
        background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08);
        border-radius: 14px; overflow: hidden;
      }
      #tvt-library .tvt-card img {
        width: 100%; aspect-ratio: 16/9; object-fit: cover; background: #111;
      }
      #tvt-library .meta { padding: 12px; display: grid; gap: 8px; }
      #tvt-library .title { color: #fff; text-decoration: none; font-weight: 650; }
      #tvt-library .sub { opacity: .65; font-size: 12px; }
      #tvt-library .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      #tvt-library .row button {
        padding: 10px 8px; border: 0; border-radius: 10px;
        background: rgba(255,255,255,.12); color: inherit;
      }
      #tvt-library .row button.primary { background: #5b8cff; color: #fff; font-weight: 650; }
      video.tvt-picked { outline: 3px solid #5b8cff; outline-offset: 2px; }
      html.tvt-selecting video { cursor: pointer; }
      #tvt-queue {
        position: fixed; inset: 0; z-index: 2147483647;
        background: #000; color: #f2f4f8; font: 14px/1.4 -apple-system, system-ui, sans-serif;
        display: flex; flex-direction: column; padding-top: env(safe-area-inset-top);
      }
      #tvt-queue header {
        display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 12px;
      }
      #tvt-queue header span { flex: 1 1 auto; font-weight: 650; }
      #tvt-queue header button {
        padding: 8px 10px; border: 0; border-radius: 10px;
        background: rgba(255,255,255,.14); color: inherit;
      }
      #tvt-queue video {
        width: 100%; flex: 1 1 auto; min-height: 200px; background: #000;
        object-fit: contain;
      }
      #tvt-library .empty { text-align: center; opacity: .7; padding: 40px 12px; }
      #tvt-settings {
        position: fixed; inset: 0; z-index: 2147483647;
        background: rgba(8,10,14,.96); color: #f2f4f8;
        font: 14px/1.4 -apple-system, system-ui, sans-serif;
        display: flex; flex-direction: column; padding-top: env(safe-area-inset-top);
      }
      #tvt-settings header {
        display: flex; gap: 8px; align-items: center;
        padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,.08);
      }
      #tvt-settings h1 { font-size: 17px; margin: 0; flex: 1; }
      #tvt-settings header button {
        padding: 8px 10px; border: 0; border-radius: 10px;
        background: rgba(255,255,255,.12); color: inherit;
      }
      #tvt-settings .tvt-body {
        overflow: auto; padding: 14px 14px max(28px, env(safe-area-inset-bottom));
        display: grid; gap: 16px;
      }
      #tvt-settings h2 {
        margin: 0 0 8px; font-size: 13px; letter-spacing: .04em;
        text-transform: uppercase; opacity: .55;
      }
      #tvt-settings .tvt-row {
        display: flex; gap: 12px; align-items: center; justify-content: space-between;
        padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.06);
      }
      #tvt-settings .tvt-row span { flex: 1; }
      #tvt-settings input[type="checkbox"] { width: 22px; height: 22px; }
      #tvt-settings input[type="range"] { width: 140px; }
      #tvt-settings input[type="text"], #tvt-settings input[type="password"] {
        width: 100%; box-sizing: border-box; margin-top: 6px; padding: 10px 12px;
        border-radius: 10px; border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.06); color: inherit;
      }
      #tvt-settings .tvt-field { display: grid; gap: 4px; }
      #tvt-settings .tvt-field label { opacity: .7; font-size: 12px; }
    `;
  }

  function enhanceVideo(video) {
    if (video.dataset.tvtEnhanced === '1') return;
    video.dataset.tvtEnhanced = '1';

    try {
      const s = loadSettings();
      const isMain = isMainVideo(video);

      if (s.nativeControls) {
        video.controls = true;
        video.setAttribute('controls', '');
      }

      video.setAttribute('playsinline', '');
      video.playsInline = true;

      if (s.airPlay) {
        video.disableRemotePlayback = false;
        video.removeAttribute('disableremoteplayback');
        video.removeAttribute('disableRemotePlayback');
        video.setAttribute('x-webkit-airplay', 'allow');
      }

      video.muted = false;
      video.defaultMuted = false;
      video.removeAttribute('muted');

      if (isMain && s.soundMain) {
        video.volume = minVolume();
      }
    } catch (e) {
      console.warn('[TVT] Error enhancing video:', e);
    }
  }

  function armGestureUnmute() {
    if (document.documentElement.dataset.tvtGestureSound === '1') return;
    document.documentElement.dataset.tvtGestureSound = '1';
    const kick = (e) => {
      if (selectMode) return;
      if (e?.target?.closest?.('#tvt-settings, #tvt-library, #tvt-queue, #tvt-ios-fab')) return;
      const main = findMainVideo();
      if (main) enhanceVideo(main);
    };
    ['pointerdown', 'touchend', 'click'].forEach((type) => {
      document.addEventListener(type, kick, { capture: true, passive: true });
    });
  }

  function hideAdOverlays() {
    const now = Date.now();
    if (now - lastHideAdsTime < 5000) return;
    lastHideAdsTime = now;

    const s = loadSettings();
    if (s.hideAds) {
      AD_OVERLAY_SELECTORS.forEach((selector) => {
        try {
          document.querySelectorAll(selector).forEach((el) => {
            if (containsMainVideo(el) || el.closest?.('video')) return;
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
          });
        } catch (e) {
          console.warn('[TVT] Ad hiding error:', e);
        }
      });
    }
    if (!s.clickSkip) return;
    try {
      document.querySelectorAll('button, [role="button"], a').forEach((el) => {
        if (el.closest('#tvt-ios-fab, #tvt-library, #tvt-queue')) return;
        const t = (el.textContent || '').trim().toLowerCase();
        if (/^(skip(\s*ad)?|close\s*ad)$/i.test(t) || t === 'skip') {
          try {
            el.click();
          } catch {}
        }
      });
    } catch (e) {
      console.warn('[TVT] Skip ad error:', e);
    }
  }

  function previewFromEvent(e) {
    let video = e.target.closest?.('video');
    if (!video) {
      const host = e.target.closest?.('a, article, li, [class*="thumb"], [class*="preview"], [class*="trailer"]');
      video = host?.querySelector?.('video');
    }
    if (!(video instanceof HTMLVideoElement) || isMainVideo(video)) return null;
    return video;
  }

  function toggleSelect(video) {
    if (selectedPreviews.has(video)) {
      selectedPreviews.delete(video);
      video.classList.remove('tvt-picked');
    } else {
      selectedPreviews.add(video);
      video.classList.add('tvt-picked');
    }
    updateFabState();
  }

  function setSelectMode(on) {
    selectMode = on;
    document.documentElement.classList.toggle('tvt-selecting', on);
    if (!on) return;
    updateFabState();
  }

  function armPreviewSelect() {
    if (document.documentElement.dataset.tvtSelectArm === '1') return;
    document.documentElement.dataset.tvtSelectArm = '1';
    document.addEventListener(
      'click',
      (e) => {
        if (!selectMode) return;
        if (e.target.closest('#tvt-ios-fab, #tvt-library, #tvt-queue')) return;
        const video = previewFromEvent(e);
        if (!video) return;
        e.preventDefault();
        e.stopPropagation();
        toggleSelect(video);
      },
      true
    );
  }

  function closeQueue() {
    const player = document.getElementById('tvt-queue-video');
    try {
      player?.pause();
    } catch {}
    document.getElementById('tvt-queue')?.remove();
  }

  function playQueueIndex(i) {
    if (!queueClips.length) return;
    queueIndex = (i + queueClips.length) % queueClips.length;
    const clip = queueClips[queueIndex];
    const player = document.getElementById('tvt-queue-video');
    const label = document.getElementById('tvt-queue-label');
    if (label) label.textContent = `Compilation ${queueIndex + 1} / ${queueClips.length}`;
    if (!player) return;
    enhanceVideo(player);
    const src = clip.src;
    if (src) {
      if (player.src !== src) player.src = src;
      const play = player.play();
      if (play && typeof play.catch === 'function') play.catch(() => {});
      return;
    }
    if (clip.video) {
      enhanceVideo(clip.video);
      clip.video.scrollIntoView({ block: 'center', inline: 'nearest' });
      const play = clip.video.play();
      if (play && typeof play.catch === 'function') play.catch(() => {});
    }
  }

  function openQueue() {
    queueClips = [...selectedPreviews]
      .map((video) => ({ src: bestSrc(video), video }))
      .filter((c) => c.src || c.video);
    if (!queueClips.length) {
      notify('Select previews first');
      setSelectMode(true);
      return;
    }
    closeQueue();
    injectCSS();
    const root = document.createElement('div');
    root.id = 'tvt-queue';
    const header = document.createElement('header');
    const label = document.createElement('span');
    label.id = 'tvt-queue-label';
    const mk = (text, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.addEventListener('click', fn);
      return b;
    };
    header.append(
      label,
      mk('Prev', () => playQueueIndex(queueIndex - 1)),
      mk('Next', () => playQueueIndex(queueIndex + 1)),
      mk('Close', closeQueue)
    );
    const player = document.createElement('video');
    player.id = 'tvt-queue-video';
    player.controls = true;
    player.setAttribute('controls', '');
    player.setAttribute('playsinline', '');
    player.playsInline = true;
    player.setAttribute('x-webkit-airplay', 'allow');
    player.addEventListener('ended', () => {
      if (queueIndex + 1 < queueClips.length) playQueueIndex(queueIndex + 1);
    });
    root.append(header, player);
    document.documentElement.append(root);
    playQueueIndex(0);
  }

  function enhanceVideos() {
    const now = Date.now();
    if (now - lastEnhanceTime < 10000) return;
    lastEnhanceTime = now;

    try {
      document.querySelectorAll('video').forEach(enhanceVideo);
    } catch (e) {
      console.warn('[TVT] Error in enhanceVideos:', e);
    }
  }

  function refreshFab() {
    const fab = document.getElementById('tvt-ios-fab');
    if (!fab) return;
    const s = loadSettings();
    const setHidden = (action, hidden) => {
      const btn = fab.querySelector(`[data-action="${action}"]`);
      if (btn) btn.hidden = hidden;
    };
    setHidden('select', !s.showSelect);
    setHidden('play', !s.showSelect);
    setHidden('save', !s.showSave);
    setHidden('library', !s.showLibrary);
    updateFabState();
  }

  function updateFabState() {
    const saveBtn = document.querySelector('#tvt-ios-fab [data-action="save"]');
    if (saveBtn) {
      const saved = loadList().some((i) => canonicalize(i.url) === canonicalize(location.href));
      saveBtn.textContent = saved ? 'Saved' : 'Save';
      saveBtn.classList.toggle('saved', saved);
    }
    const selectBtn = document.querySelector('#tvt-ios-fab [data-action="select"]');
    if (selectBtn) selectBtn.textContent = selectMode ? 'Done' : 'Select';
    const playBtn = document.querySelector('#tvt-ios-fab [data-action="play"]');
    if (playBtn) {
      const n = selectedPreviews.size;
      playBtn.textContent = n ? `Play ${n}` : 'Play';
    }
  }

  function ensureFab() {
    if (document.getElementById('tvt-ios-fab')) {
      refreshFab();
      return;
    }
    const fab = document.createElement('div');
    fab.id = 'tvt-ios-fab';

    const mk = (label, action, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.dataset.action = action;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
      return b;
    };

    fab.append(
      mk('Select', 'select', () => setSelectMode(!selectMode)),
      mk('Play', 'play', () => openQueue()),
      mk('Save', 'save', () => saveCurrentPage()),
      mk('Library', 'library', () => openLibrary()),
      mk('Settings', 'settings', () => openSettings())
    );
    document.documentElement.appendChild(fab);
    refreshFab();
  }

  function closeLibrary() {
    document.getElementById('tvt-library')?.remove();
  }

  function openLibrary(items) {
    closeLibrary();
    injectCSS();
    const list = items || loadList();
    const root = document.createElement('div');
    root.id = 'tvt-library';

    const header = document.createElement('header');
    const h1 = document.createElement('h1');
    h1.textContent = `Saved (${list.length})`;
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Filter…';

    const mkBtn = (label, fn, cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (cls) b.className = cls;
      b.addEventListener('click', fn);
      return b;
    };

    header.append(
      h1,
      mkBtn('Pull', async () => {
        try {
          const merged = mergeLists(await pullFromGist(), loadList());
          saveList(merged);
          openLibrary(merged);
        } catch (err) {
          alert(String(err.message || err));
        }
      }),
      mkBtn('Push', async () => {
        try {
          await pushToGist(loadList());
          notify('Pushed');
        } catch (err) {
          alert(String(err.message || err));
        }
      }),
      mkBtn('Close', closeLibrary),
      search
    );

    const body = document.createElement('div');
    body.className = 'tvt-body';

    function render(filter = '') {
      body.replaceChildren();
      const q = filter.trim().toLowerCase();
      const filtered = !q
        ? list
        : list.filter(
            (i) =>
              i.title?.toLowerCase().includes(q) ||
              i.url?.toLowerCase().includes(q) ||
              i.site?.toLowerCase().includes(q)
          );
      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No saved links';
        body.append(empty);
        return;
      }
      filtered.forEach((item) => {
        const card = document.createElement('article');
        card.className = 'tvt-card';
        if (item.thumb) {
          const img = document.createElement('img');
          img.src = item.thumb;
          img.loading = 'lazy';
          img.referrerPolicy = 'no-referrer';
          card.append(img);
        }
        const meta = document.createElement('div');
        meta.className = 'meta';
        const title = document.createElement('a');
        title.className = 'title';
        title.href = item.url;
        title.textContent = item.title || item.url;
        const sub = document.createElement('div');
        sub.className = 'sub';
        sub.textContent = `${item.site || ''} · ${item.savedAt ? new Date(item.savedAt).toLocaleString() : ''}`;
        const row = document.createElement('div');
        row.className = 'row';
        row.append(
          mkBtn('Open', () => {
            window.open(item.url, '_blank', 'noopener');
          }),
          mkBtn('Copy', () => {
            try {
              GM_setClipboard(item.url);
              notify('Copied');
            } catch {
              prompt('Copy link', item.url);
            }
          }),
          mkBtn('Remove', () => {
            const next = loadList().filter(
              (i) => i.id !== item.id && canonicalize(i.url) !== canonicalize(item.url)
            );
            saveList(next);
            openLibrary(next);
            pushToGist(next).catch(() => {});
          }),
          mkBtn(
            'Download',
            async () => {
              try {
                await queueDownload(item);
                notify('Queued on Mac');
              } catch (err) {
                alert(
                  `${err.message || err}\n\nOpen the Mac library PWA on Wi‑Fi, or set Download server in Config.`
                );
              }
            },
            'primary'
          )
        );
        meta.append(title, sub, row);
        card.append(meta);
        body.append(card);
      });
    }

    search.addEventListener('input', () => render(search.value));
    root.append(header, body);
    document.documentElement.append(root);
    render();
  }

  function closeSettings() {
    document.getElementById('tvt-settings')?.remove();
  }

  function openSettings() {
    closeSettings();
    injectCSS();
    const s = loadSettings();
    const cfg = loadCloudConfig();
    const root = document.createElement('div');
    root.id = 'tvt-settings';

    const header = document.createElement('header');
    const h1 = document.createElement('h1');
    h1.textContent = 'Settings';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Done';
    close.addEventListener('click', () => {
      applySettingsLive();
      closeSettings();
    });
    header.append(h1, close);

    const body = document.createElement('div');
    body.className = 'tvt-body';

    const section = (title) => {
      const wrap = document.createElement('section');
      const h2 = document.createElement('h2');
      h2.textContent = title;
      wrap.append(h2);
      return wrap;
    };

    const toggle = (label, key) => {
      const row = document.createElement('label');
      row.className = 'tvt-row';
      const span = document.createElement('span');
      span.textContent = label;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!s[key];
      input.addEventListener('change', () => {
        saveSettings({ [key]: input.checked });
        applySettingsLive();
      });
      row.append(span, input);
      return row;
    };

    const field = (label, value, password) => {
      const wrap = document.createElement('div');
      wrap.className = 'tvt-field';
      const lab = document.createElement('label');
      lab.textContent = label;
      const input = document.createElement('input');
      input.type = password ? 'password' : 'text';
      input.value = value || '';
      input.autocapitalize = 'off';
      input.autocomplete = 'off';
      wrap.append(lab, input);
      wrap.getValue = () => input.value;
      return wrap;
    };

    const playback = section('Playback');
    playback.append(
      toggle('Sound on main video', 'soundMain'),
      toggle('Sound on previews', 'soundPreviews')
    );
    const volRow = document.createElement('label');
    volRow.className = 'tvt-row';
    const volLabel = document.createElement('span');
    const volInput = document.createElement('input');
    volInput.type = 'range';
    volInput.min = '1';
    volInput.max = '100';
    volInput.value = String(Math.round(s.volume * 100));
    const setVolLabel = () => {
      volLabel.textContent = `Volume ${volInput.value}%`;
    };
    setVolLabel();
    volInput.addEventListener('input', setVolLabel);
    volInput.addEventListener('change', () => {
      saveSettings({ volume: Number(volInput.value) / 100 });
    });
    volRow.append(volLabel, volInput);
    playback.append(
      volRow,
      toggle('Keep volume at this level', 'lockVolume'),
      toggle('Allow AirPlay', 'airPlay'),
      toggle('Native video controls', 'nativeControls')
    );

    const ads = section('Ads');
    ads.append(toggle('Hide ad overlays', 'hideAds'), toggle('Auto-click Skip ad', 'clickSkip'));

    const tools = section('Toolbar');
    tools.append(
      toggle('Select + compilation play', 'showSelect'),
      toggle('Save button', 'showSave'),
      toggle('Library button', 'showLibrary')
    );

    const cloud = section('Cloud / Mac');
    const tokenField = field('GitHub token (gist scope)', cfg.token, true);
    const gistField = field('Gist ID', cfg.gistId, false);
    const serverField = field('Mac download server URL', downloadServer(), false);
    const dlTokField = field('Download server token', downloadToken(), true);
    const saveCloud = document.createElement('button');
    saveCloud.type = 'button';
    saveCloud.textContent = 'Save cloud settings';
    saveCloud.style.cssText =
      'margin-top:10px;padding:12px;border:0;border-radius:12px;background:#5b8cff;color:#fff;font-weight:650';
    saveCloud.addEventListener('click', () => {
      saveCloudConfig({
        token: tokenField.getValue().trim(),
        gistId: gistField.getValue().trim(),
        filename: cfg.filename || 'tube-videos.json',
      });
      GM_setValue(SERVER_KEY, serverField.getValue().trim().replace(/\/$/, ''));
      GM_setValue('tvt_download_token', dlTokField.getValue().trim());
      notify('Cloud settings saved');
    });
    cloud.append(tokenField, gistField, serverField, dlTokField, saveCloud);

    body.append(playback, ads, tools, cloud);
    root.append(header, body);
    document.documentElement.append(root);
  }

  function start() {
    try {
      injectCSS();
      armGestureUnmute();
      armPreviewSelect();
      enhanceVideos();
      hideAdOverlays();
      ensureFab();

      let observerTimeout = null;
      const obs = new MutationObserver(() => {
        clearTimeout(observerTimeout);
        observerTimeout = setTimeout(enhanceVideos, 1000);
      });
      obs.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });

      setInterval(enhanceVideos, 15000);
      setInterval(hideAdOverlays, 10000);
    } catch (err) {
      console.error('[TVT] Init error:', err);
      notify('Initialization error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
