(() => {
  'use strict';
  const POINTS = [5, 3, 1];
  const CLUES_PER_WORD = 3;
  const COMPET_WORDS = 5;
  const SERIE_PASSES = 2;
  const STORE_KEY = 'motdepasse:v1';

  const MODES = {
    compet:   { label: 'Partie Simple',       passes: 0 },
    serie:    { label: 'Mode Série',        passes: SERIE_PASSES },
    training: { label: 'Entraînement',      passes: Infinity },
  };

  const $ = (sel) => document.querySelector(sel);
  const pl = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const norm = (s) => s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const squash = (s) => norm(s).replace(/^(le|la|les|l|un|une|des|du|de la|d) /, '').replace(/ /g, '');

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[n];
  }

  function isMatch(input, answer) {
    const a = squash(answer);
    const g = squash(input);
    if (!g) return false;
    if (g === a) return true;
    const sing = (s) => s.replace(/[sx]$/, '');
    if (sing(g) === sing(a)) return true;
    if (a.length >= 5 && g.length >= 4 && levenshtein(g, a) <= 1) return true;
    if (a.length >= 9 && levenshtein(g, a) <= 2) return true;
    return false;
  }

  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
  }
  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { }
  }
  const store = loadStore();

  const sfx = (() => {
    let ctx = null;
    let muted = Boolean(store.muted);

    function ensureCtx() {
      if (muted) return null;
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) ctx = new AudioCtx();
      }
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      return ctx;
    }

    function tone(freq, type, startOffset, duration, gainPeak = 0.12, endFreq = null) {
      const c = ensureCtx();
      if (!c) return;
      const t0 = c.currentTime + startOffset;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (endFreq != null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + duration);
      }
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    }

    return {
      isMuted: () => muted,
      toggle() {
        muted = !muted;
        store.muted = muted;
        saveStore();
        if (!muted) this.click();
        return muted;
      },
      click() {
        tone(520, 'sine', 0, 0.055, 0.08, 680);
      },
      reveal() {
        tone(380, 'triangle', 0, 0.11, 0.1, 560);
        tone(760, 'sine', 0.05, 0.14, 0.07, 880);
      },
      wrong() {
        tone(210, 'sawtooth', 0, 0.14, 0.09, 165);
        tone(160, 'sawtooth', 0.11, 0.22, 0.09, 120);
      },
      pass() {
        tone(480, 'sine', 0, 0.12, 0.08, 280);
        tone(340, 'triangle', 0.06, 0.12, 0.07, 520);
      },
      win(points) {
        if (points === 5) {
          [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
            tone(f, 'triangle', i * 0.065, 0.28, 0.12);
          });
        } else {
          [440, 554.37, 659.25, 880].forEach((f, i) => {
            tone(f, 'triangle', i * 0.07, 0.24, 0.11);
          });
        }
      },
      lose() {
        [311.13, 293.66, 277.18, 246.94].forEach((f, i) => {
          tone(f, 'sawtooth', i * 0.13, 0.25, 0.08, f * 0.94);
        });
      },
      record() {
        [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5].forEach((f, i) => {
          tone(f, 'triangle', i * 0.08, 0.3, 0.13);
        });
      }
    };
  })();

  function updateSoundUI() {
    const muted = sfx.isMuted();
    $('#sound-icon').textContent = muted ? '🔇' : '🔊';
    $('#sound-label').textContent = muted ? 'Son coupé' : 'Son activé';
  }

  const confetti = (() => {
    const canvas = $('#confetti-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    let particles = [];
    let animId = null;
    const COLORS = ['#ffca3a', '#2ee59d', '#ff5c77', '#6c8cff', '#ffffff'];

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    function loop() {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18;
        p.rot += p.vrot;
        p.alpha -= 0.008;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      particles = particles.filter((p) => p.alpha > 0 && p.y < canvas.height + 40);
      if (particles.length > 0) {
        animId = requestAnimationFrame(loop);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        animId = null;
      }
    }

    return {
      burst(count = 55) {
        if (!ctx || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        resize();
        const cx = canvas.width / 2;
        const cy = canvas.height * 0.32;
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 3 + Math.random() * 8;
          particles.push({
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 4,
            size: 6 + Math.random() * 6,
            color: COLORS[i % COLORS.length],
            rot: Math.random() * Math.PI,
            vrot: (Math.random() - 0.5) * 0.25,
            alpha: 1,
          });
        }
        if (!animId) animId = requestAnimationFrame(loop);
      }
    };
  })();

  const BANK = Object.entries(window.MOT_DE_PASSE_WORDS || {})
    .map(([answer, raw]) => {
      const na = squash(answer);
      const unique = [...new Set(raw.split(',').map((c) => c.trim()).filter(Boolean))];
      const clues = unique.filter((c) => {
        const nc = squash(c);
        if (!nc || nc === na) return false;
        if (na.length >= 3 && nc.includes(na)) return false;
        if (nc.length >= 3 && na.includes(nc)) return false;
        return true;
      });
      return { answer, clues };
    })
    .filter((w) => w.clues.length >= CLUES_PER_WORD);

  $('#word-count-badge').textContent = `${BANK.length} mots code`;

  function renderRecords() {
    $('#rec-compet').textContent = store.competBest != null ? `${store.competBest} / ${COMPET_WORDS * POINTS[0]}` : '–';
    $('#rec-serie').textContent = store.serieBest != null ? pl(store.serieBest, 'mot') : '–';
  }

  let state = null;

  const screens = { menu: $('#screen-menu'), game: $('#screen-game'), end: $('#screen-end') };
  const dom = {
    modeLabel: $('#mode-label'),
    roundDots: $('#round-dots'),
    statALabel: $('#stat-a-label'), statA: $('#stat-a'),
    statBLabel: $('#stat-b-label'), statB: $('#stat-b'),
    slots: $('#slots'),
    feedback: $('#feedback'),
    form: $('#guess-form'), input: $('#guess-input'),
    pass: $('#pass-btn'),
    result: $('#result'),
    resultBadge: $('#result-badge'),
    resultTitle: $('#result-title'),
    resultText: $('#result-text'),
    resultExtra: $('#result-extra'),
    next: $('#next-btn'),
  };

  function show(name) {
    Object.entries(screens).forEach(([k, s]) => { s.hidden = k !== name; });
    window.scrollTo(0, 0);
  }

  function startGame(modeKey) {
    sfx.click();
    state = {
      mode: modeKey,
      deck: [],
      last: null,
      history: [],
      score: 0,
      streak: 0,
      found: 0,
      played: 0,
      passesLeft: MODES[modeKey].passes,
      cur: null,
      phase: 'idle',
      over: false,
      notice: null,
    };
    show('game');
    loadWord();
  }

  function draw() {
    if (!state.deck.length) {
      state.deck = shuffle(BANK.map((_, i) => i));
      if (state.deck.length > 1 && state.deck[state.deck.length - 1] === state.last) {
        [state.deck[0], state.deck[state.deck.length - 1]] = [state.deck[state.deck.length - 1], state.deck[0]];
      }
    }
    const idx = state.deck.pop();
    state.last = idx;
    return BANK[idx];
  }

  function loadWord() {
    const word = draw();
    state.cur = {
      answer: word.answer,
      clues: shuffle(word.clues).slice(0, CLUES_PER_WORD),
      step: 0,
      guesses: [],
      found: false,
    };
    state.phase = 'guessing';
    setFeedback(state.notice || '', 'info');
    state.notice = null;
    dom.input.value = '';
    sfx.reveal();
    render();
    dom.input.focus({ preventScroll: true });
  }

  function setFeedback(text, kind) {
    dom.feedback.textContent = text;
    dom.feedback.className = `feedback ${kind || ''}`;
  }

  function renderStats() {
    const s = state;
    dom.modeLabel.textContent = MODES[s.mode].label;
    const passesText = s.mode === 'training' ? '∞' : String(s.passesLeft);

    dom.roundDots.replaceChildren();
    if (s.mode === 'compet') {
      for (let i = 0; i < COMPET_WORDS; i++) {
        let cls = 'round-dot';
        if (i < s.history.length) {
          cls += s.history[i].found ? ' ok' : ' ko';
        } else if (i === s.history.length && s.phase === 'guessing') {
          cls += ' current';
        }
        dom.roundDots.appendChild(el('span', cls));
      }
    }

    if (s.mode === 'compet') {
      const n = Math.min(s.played + (s.phase === 'guessing' ? 1 : 0), COMPET_WORDS);
      dom.statALabel.textContent = 'Manche'; dom.statA.textContent = `${n} / ${COMPET_WORDS}`;
      dom.statBLabel.textContent = 'Score';  dom.statB.textContent = `${s.score} pts`;
    } else if (s.mode === 'serie') {
      dom.statALabel.textContent = 'Série en cours'; dom.statA.textContent = `${s.streak} 🔥`;
      dom.statBLabel.textContent = 'Passe disponible';   dom.statB.textContent = passesText;
    } else {
      dom.statALabel.textContent = 'Trouvés';      dom.statA.textContent = `${s.found} / ${s.played}`;
      dom.statBLabel.textContent = 'Passe disponible'; dom.statB.textContent = passesText;
    }
  }

  function renderSlots() {
    const { cur, phase } = state;
    dom.slots.replaceChildren();
    for (let i = 0; i < CLUES_PER_WORD; i++) {
      const revealed = i <= cur.step;
      let st = 'locked';
      if (revealed) {
        if (phase === 'guessing' && i === cur.step) st = 'active';
        else if (cur.found && i === cur.step) st = 'found';
        else st = 'missed';
      }
      const li = el('li', 'slot');
      li.dataset.state = st;
      li.appendChild(el('span', 'slot-num', String(i + 1)));
      li.appendChild(el('span', 'slot-clue', revealed ? cur.clues[i] : '• • • • •'));
      li.appendChild(el('span', 'slot-pts', pl(POINTS[i], 'pt')));
      let guessText = '';
      if (cur.guesses[i] != null) guessText = `✗ « ${cur.guesses[i]} »`;
      else if (st === 'found') guessText = `✓ Trouvé ! (+${pl(POINTS[i], 'pt')})`;
      li.appendChild(el('span', 'slot-guess', guessText));
      dom.slots.appendChild(li);
    }
  }

  function renderControls() {
    const guessing = state.phase === 'guessing';
    dom.form.hidden = !guessing;
    dom.result.hidden = guessing;

    const canPass = MODES[state.mode].passes > 0;
    dom.pass.hidden = !canPass;
    if (canPass) {
      const left = state.mode === 'training' ? '∞' : state.passesLeft;
      dom.pass.textContent = `Passer (${left})`;
      dom.pass.disabled = state.mode !== 'training' && state.passesLeft <= 0;
    }
  }

  function render() {
    renderStats();
    renderSlots();
    renderControls();
  }

  function submitGuess(raw) {
    const { cur } = state;
    const guess = raw.trim();
    if (!guess) return;

    if (isMatch(guess, cur.answer)) {
      const pts = POINTS[cur.step];
      cur.found = true;
      cur.guesses[cur.step] = null;
      finishWord(true, pts);
      return;
    }

    cur.guesses[cur.step] = guess;
    if (cur.step < CLUES_PER_WORD - 1) {
      cur.step++;
      sfx.wrong();
      setTimeout(() => sfx.reveal(), 150);
      setFeedback('Ce n\'est pas le code attendu.', 'ko');
      dom.input.value = '';
      render();
      shake();
      dom.input.focus({ preventScroll: true });
    } else {
      finishWord(false, 0);
    }
  }

  function shake() {
    dom.form.classList.remove('shake');
    void dom.form.offsetWidth;
    dom.form.classList.add('shake');
  }

  function finishWord(found, points) {
    const s = state;
    const { cur } = s;
    s.phase = 'result';
    s.played++;
    s.history.push({ answer: cur.answer, found, points });

    if (s.mode === 'compet') s.score += points;
    if (s.mode === 'serie' && found) s.streak++;
    if (s.mode === 'training' && found) s.found++;

    const lastCompet = s.mode === 'compet' && s.played >= COMPET_WORDS;
    const serieLost = s.mode === 'serie' && !found;
    s.over = lastCompet || serieLost;

    const word = cur.answer.toUpperCase();
    dom.result.className = `result ${found ? 'win' : 'lose'}`;

    if (found) {
      sfx.win(points);
      if (points === POINTS[0]) confetti.burst(65);
      dom.resultBadge.textContent = points === POINTS[0] ? '⚡ Coup de maître' : `+${pl(points, 'point')}`;
      dom.resultTitle.textContent = points === POINTS[0] ? 'Du premier coup !' : 'Bien joué !';
      let txt = `Le mot code était bien « ${word} », trouvé dès l'indice n° ${cur.step + 1}`;
      if (s.mode === 'compet') txt += ` (+${pl(points, 'point')}).`;
      else if (s.mode === 'serie') txt += ` — Série : ${pl(s.streak, 'mot')}.`;
      else txt += '.';
      dom.resultText.textContent = txt;
    } else {
      sfx.lose();
      dom.resultBadge.textContent = 'Manche perdue';
      dom.resultTitle.textContent = 'Dommage !';
      let txt = `Le mot code caché était « ${word} ».`;
      if (s.mode === 'compet') txt += ' Aucun point marqué sur cette manche.';
      if (s.mode === 'serie') txt += ` Votre série s'arrête à ${pl(s.streak, 'mot')}.`;
      dom.resultText.textContent = txt;
    }

    const remaining = cur.clues.slice(cur.step + 1);
    if (remaining.length > 0) {
      dom.resultExtra.hidden = false;
      dom.resultExtra.innerHTML = `Autres indices prévus : <strong>${remaining.join(' • ').toUpperCase()}</strong>`;
    } else {
      dom.resultExtra.hidden = true;
    }

    dom.next.textContent = s.over ? 'Voir le bilan final →' : 'Continuer →';
    setFeedback('', 'info');
    render();
    dom.next.focus({ preventScroll: true });
  }

  function passWord() {
    const s = state;
    if (s.phase !== 'guessing') return;
    if (s.mode === 'compet') return;
    if (s.mode === 'serie') {
      if (s.passesLeft <= 0) return;
      s.passesLeft--;
    }
    sfx.pass();
    s.notice = `Mot passé : « ${s.cur.answer.toUpperCase()} ». Nouveau mot code !`;
    loadWord();
  }

  function nextStep() {
    if (state.phase !== 'result') return;
    sfx.click();
    if (state.over) endGame();
    else loadWord();
  }

  function endGame() {
    const s = state;
    const title = $('#end-title');
    const big = $('#end-big');
    const sub = $('#end-sub');
    const rec = $('#end-record');
    rec.textContent = '';

    let isNewRecord = false;

    if (s.mode === 'compet') {
      const max = COMPET_WORDS * POINTS[0];
      title.textContent = 'Partie Compèt terminée';
      big.textContent = `${s.score} / ${max}`;
      sub.textContent = scoreComment(s.score, max);
      if (store.competBest == null || s.score > store.competBest) {
        if (s.score > 0) {
          rec.textContent = '🏆 Nouveau record personnel !';
          store.competBest = s.score;
          saveStore();
          isNewRecord = true;
        }
      } else {
        rec.textContent = `Meilleur score : ${store.competBest} / ${max}`;
      }
    } else if (s.mode === 'serie') {
      title.textContent = 'Fin de la Série';
      big.textContent = String(s.streak);
      sub.textContent = s.streak === 0
        ? 'Aucun mot code trouvé d\'affilée… retentez votre chance !'
        : `${s.streak > 1 ? 'mots code trouvés' : 'mot code trouvé'} d'affilée.`;
      if (store.serieBest == null || s.streak > store.serieBest) {
        if (s.streak > 0) {
          store.serieBest = s.streak;
          saveStore();
          rec.textContent = '🏆 Nouveau record de série !';
          isNewRecord = true;
        }
      } else {
        rec.textContent = `Meilleure série : ${pl(store.serieBest, 'mot')}`;
      }
    } else {
      title.textContent = 'Fin de l\'entraînement';
      big.textContent = `${s.found} / ${s.played}`;
      sub.textContent = s.played === 0 ? 'Aucun mot joué.' : 'mots code découverts.';
    }

    if (isNewRecord) {
      sfx.record();
      confetti.burst(90);
    }

    const recap = $('#end-recap');
    recap.replaceChildren();
    s.history.forEach((h) => {
      const label = h.found
        ? `✓ ${h.answer}${s.mode === 'compet' ? ` (+${h.points})` : ''}`
        : `✗ ${h.answer}`;
      recap.appendChild(el('li', h.found ? 'ok' : 'ko', label));
    });

    $('#again-btn').dataset.mode = s.mode;
    state = null;
    renderRecords();
    show('end');
  }

  function scoreComment(score, max) {
    if (score === max) return 'Score parfait ! 5 sur 5 dès le premier indice ! 🌟';
    if (score >= 20) return 'Performance digne d\'une finale télévisée !';
    if (score >= 13) return 'Très beau parcours, vous avez l\'esprit vif !';
    if (score >= 6) return 'Pas mal ! Quelques pièges mais de bonnes intuitions.';
    return 'Courage, quelques parties d\'entraînement et vous serez imbattable !';
  }

  function quit() {
    if (!state) return;
    sfx.click();
    if (state.mode === 'training') {
      endGame();
      return;
    }
    if (state.over || window.confirm('Abandonner la partie en cours ?')) {
      state = null;
      renderRecords();
      show('menu');
    }
  }

  $('#sound-btn').addEventListener('click', () => {
    sfx.toggle();
    updateSoundUI();
  });

  document.querySelectorAll('.mode-card').forEach((btn) => {
    btn.addEventListener('click', () => startGame(btn.dataset.mode));
  });

  dom.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state && state.phase === 'guessing') submitGuess(dom.input.value);
  });

  dom.pass.addEventListener('click', passWord);
  dom.next.addEventListener('click', nextStep);
  $('#quit-btn').addEventListener('click', quit);
  $('#again-btn').addEventListener('click', (e) => startGame(e.currentTarget.dataset.mode || 'training'));
  $('#menu-btn').addEventListener('click', () => { sfx.click(); renderRecords(); show('menu'); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && state && state.phase === 'result' && document.activeElement !== dom.next) {
      e.preventDefault();
      nextStep();
    }
  });

  updateSoundUI();
  renderRecords();
  show('menu');
})();