import { SEASONS } from './season';

export type Ui = {
  topEl: HTMLElement;
  dockEl: HTMLElement;
  setSeason: (index: number) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (value: number) => void;
  setTarget: (index: number | null) => void;
  setFullscreen: (on: boolean) => void;
  showFallback: (message: string) => void;
  markReady: () => void;
};

export function bindUi(handlers: {
  onTogglePlay: () => void;
  onSeason: (index: number) => void;
  onSpeed: (value: number) => void;
  onFullscreen: () => void;
}): Ui {
  const topEl = document.querySelector<HTMLElement>('#top');
  const dockEl = document.querySelector<HTMLElement>('#dock');
  const now = document.querySelector<HTMLElement>('#now');
  const live = document.querySelector<HTMLElement>('#live');
  const play = document.querySelector<HTMLButtonElement>('#play');
  const speed = document.querySelector<HTMLInputElement>('#speed');
  const readout = document.querySelector<HTMLElement>('#speed-readout');
  const full = document.querySelector<HTMLButtonElement>('#full');
  const fallback = document.querySelector<HTMLElement>('#fallback');
  const fallbackCopy = document.querySelector<HTMLElement>('#fallback-copy');
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-season]')];
  if (!topEl || !dockEl || !now || !live || !play || !speed || !readout || !full || !fallback || !fallbackCopy) {
    throw new Error('界面结构不完整');
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.season);
      if (Number.isInteger(index)) handlers.onSeason(index);
    });
  });
  play.addEventListener('click', handlers.onTogglePlay);
  full.addEventListener('click', handlers.onFullscreen);
  speed.addEventListener('input', () => {
    handlers.onSpeed(Number(speed.value));
  });

  let lastSpoken = '';

  return {
    topEl,
    dockEl,
    setSeason(index) {
      const season = SEASONS[index] ?? SEASONS[0];
      now.textContent = `${season.label} · ${season.line}`;
      buttons.forEach((button) => {
        const on = Number(button.dataset.season) === index;
        button.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const speech = `现在是${season.aria}`;
      if (speech !== lastSpoken) {
        live.textContent = speech;
        lastSpoken = speech;
      }
    },
    setPlaying(playing) {
      play.textContent = playing ? '暂停' : '播放';
      play.setAttribute('aria-label', playing ? '暂停轮转' : '播放轮转');
      play.setAttribute('aria-pressed', playing ? 'true' : 'false');
    },
    setSpeed(value) {
      speed.value = String(value);
      const text = `${value.toFixed(1)}×`;
      readout.textContent = text;
      speed.setAttribute('aria-valuenow', String(value));
      speed.setAttribute('aria-valuetext', `${value.toFixed(1)}倍`);
    },
    setTarget(index) {
      buttons.forEach((button) => {
        const on = index !== null && Number(button.dataset.season) === index;
        button.classList.toggle('is-target', on);
      });
    },
    setFullscreen(on) {
      full.textContent = on ? '退出' : '全屏';
      full.setAttribute('aria-label', on ? '退出全屏' : '全屏');
    },
    showFallback(message) {
      fallbackCopy.textContent = message;
      fallback.hidden = false;
      document.querySelector('canvas')?.classList.add('is-hidden');
    },
    markReady() {
      document.querySelector('canvas')?.classList.add('is-ready');
    },
  };
}
