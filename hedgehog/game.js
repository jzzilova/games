(() => {
  "use strict";

  const START_LIVES = 3;
  const BASE_POINTS = 10;
  const MAX_STREAK_BONUS = 20;
  const HIGH_SCORE_KEY = "vocabQuiz.highScore";
  const DRAG_THRESHOLD = 6;
  const MORSEL_SLOTS = [
    { x: 22, y: 26 },
    { x: 78, y: 20 },
    { x: 18, y: 76 },
    { x: 80, y: 78 },
  ];
  const MORSEL_ICONS = ["🍄", "🌰", "🍃", "🐌"];
  const HAPPY_LINES = ["Mňam! 😋", "Výborně!", "To je ono!", "Skvěle!"];
  const HURT_LINES = ["Au, ne! 😖", "Hmm, ne tak docela…", "Zkus to znovu!", "Škoda!"];

  const els = {
    screenSetup: document.getElementById("screen-setup"),
    screenQuiz: document.getElementById("screen-quiz"),
    screenResult: document.getElementById("screen-result"),

    topicGrid: document.getElementById("topic-grid"),
    btnSelectAll: document.getElementById("btn-select-all"),
    btnSelectNone: document.getElementById("btn-select-none"),
    setupError: document.getElementById("setup-error"),
    btnStart: document.getElementById("btn-start"),
    highScoreValue: document.getElementById("high-score-value"),

    hudProgress: document.getElementById("hud-progress"),
    hudScoreValue: document.getElementById("hud-score-value"),
    hudStreakValue: document.getElementById("hud-streak-value"),
    hudLives: document.getElementById("hud-lives"),
    progressFill: document.getElementById("progress-fill"),
    pathMarker: document.getElementById("path-marker"),

    scene: document.getElementById("scene"),
    questionTopicIcon: document.getElementById("question-topic-icon"),
    questionTopicName: document.getElementById("question-topic-name"),
    questionDirection: document.getElementById("question-direction"),
    questionWord: document.getElementById("question-word"),

    mascotWrap: document.getElementById("mascot-wrap"),
    mascot: document.getElementById("mascot"),
    mascotBubble: document.getElementById("mascot-bubble"),

    meadow: document.getElementById("meadow"),
    answerAreaTyped: document.getElementById("answer-area-typed"),
    typedInput: document.getElementById("typed-input"),
    btnSubmitTyped: document.getElementById("btn-submit-typed"),

    feedback: document.getElementById("feedback"),
    btnNext: document.getElementById("btn-next"),

    resultMascot: document.getElementById("result-mascot"),
    resultTitle: document.getElementById("result-title"),
    resultStory: document.getElementById("result-story"),
    resultScore: document.getElementById("result-score"),
    resultAccuracy: document.getElementById("result-accuracy"),
    resultBestStreak: document.getElementById("result-best-streak"),
    resultNewHigh: document.getElementById("result-newhigh"),
    btnPlayAgain: document.getElementById("btn-play-again"),
    btnChangeSettings: document.getElementById("btn-change-settings"),
  };

  const topicsById = Object.fromEntries(VOCAB_TOPICS.map(t => [t.id, t]));

  const state = {
    selectedTopics: new Set(),
    mode: "multiple",
    direction: "mixed",
    roundLength: 10,
    pool: [],
    queue: [],
    index: 0,
    score: 0,
    correctCount: 0,
    lives: START_LIVES,
    streak: 0,
    bestStreak: 0,
    current: null,
    answered: false,
  };

  let bubbleTimer = null;

  // ---------- helpers ----------

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function normalize(str) {
    return str
      .toLowerCase()
      .replace(/\([^)]*\)/g, "")
      .replace(/[.,!?]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function showScreen(name) {
    [els.screenSetup, els.screenQuiz, els.screenResult].forEach(s => s.classList.remove("active"));
    if (name === "setup") els.screenSetup.classList.add("active");
    if (name === "quiz") els.screenQuiz.classList.add("active");
    if (name === "result") els.screenResult.classList.add("active");
  }

  function getHighScore() {
    return Number(localStorage.getItem(HIGH_SCORE_KEY) || 0);
  }
  function setHighScore(v) {
    localStorage.setItem(HIGH_SCORE_KEY, String(v));
  }

  // ---------- setup screen ----------

  function renderTopicGrid() {
    els.topicGrid.innerHTML = "";
    VOCAB_TOPICS.forEach(topic => {
      const label = document.createElement("label");
      label.className = "topic-card";
      label.innerHTML = `
        <input type="checkbox" value="${topic.id}">
        <span class="topic-icon">${topic.icon}</span>
        <span class="topic-name">${topic.name.en}</span>
        <span class="topic-name-cz">${topic.name.cz}</span>
      `;
      const checkbox = label.querySelector("input");
      checkbox.addEventListener("change", () => {
        label.classList.toggle("selected", checkbox.checked);
        if (checkbox.checked) state.selectedTopics.add(topic.id);
        else state.selectedTopics.delete(topic.id);
        els.setupError.hidden = true;
      });
      els.topicGrid.appendChild(label);
    });
  }

  function bindOptionCardHighlight(containerId) {
    const container = document.getElementById(containerId);
    const cards = container.querySelectorAll(".option-card");
    cards.forEach(card => {
      const input = card.querySelector("input");
      const sync = () => card.classList.toggle("checked", input.checked);
      input.addEventListener("change", () => {
        cards.forEach(c => c.classList.remove("checked"));
        sync();
      });
      sync();
    });
  }

  function initSetupScreen() {
    renderTopicGrid();
    bindOptionCardHighlight("mode-options");
    bindOptionCardHighlight("direction-options");
    bindOptionCardHighlight("length-options");
    els.highScoreValue.textContent = getHighScore();

    els.btnSelectAll.addEventListener("click", () => {
      els.topicGrid.querySelectorAll("input[type=checkbox]").forEach(cb => {
        cb.checked = true;
        cb.dispatchEvent(new Event("change"));
      });
    });
    els.btnSelectNone.addEventListener("click", () => {
      els.topicGrid.querySelectorAll("input[type=checkbox]").forEach(cb => {
        cb.checked = false;
        cb.dispatchEvent(new Event("change"));
      });
    });

    els.btnStart.addEventListener("click", startGame);
  }

  function readSetupForm() {
    state.mode = document.querySelector('input[name="mode"]:checked').value;
    state.direction = document.querySelector('input[name="direction"]:checked').value;
    const lengthVal = document.querySelector('input[name="length"]:checked').value;
    state.roundLength = lengthVal === "all" ? Infinity : Number(lengthVal);
  }

  // ---------- game flow ----------

  function buildPool() {
    const pool = [];
    state.selectedTopics.forEach(id => {
      const topic = topicsById[id];
      topic.words.forEach(w => pool.push({ en: w.en, cz: w.cz, topicId: topic.id }));
    });
    return pool;
  }

  function startGame() {
    readSetupForm();
    if (state.selectedTopics.size === 0) {
      els.setupError.hidden = false;
      return;
    }
    state.pool = buildPool();
    const count = Math.min(state.roundLength, state.pool.length);
    state.queue = shuffle(state.pool).slice(0, count);
    state.index = 0;
    state.score = 0;
    state.correctCount = 0;
    state.lives = START_LIVES;
    state.streak = 0;
    state.bestStreak = 0;

    showScreen("quiz");
    setMascotState("idle");
    renderLives();
    nextQuestion();
  }

  function pickDirection() {
    if (state.direction === "mixed") return Math.random() < 0.5 ? "en-cz" : "cz-en";
    return state.direction;
  }

  function nextQuestion() {
    if (state.lives <= 0 || state.index >= state.queue.length) {
      endGame();
      return;
    }
    state.current = state.queue[state.index];
    state.current.direction = pickDirection();
    state.answered = false;

    updateHud();
    renderQuestion();
  }

  function updateHud() {
    const total = state.queue.length;
    els.hudProgress.textContent = `Question ${state.index + 1} / ${total}`;
    els.hudScoreValue.textContent = state.score;
    els.hudStreakValue.textContent = state.streak;
    const pct = (state.index / total) * 100;
    els.progressFill.style.width = `${pct}%`;
    els.pathMarker.style.left = `${pct}%`;
    renderLives();
  }

  function renderLives() {
    els.hudLives.innerHTML = "";
    for (let i = 0; i < START_LIVES; i++) {
      const spike = document.createElement("span");
      spike.className = "spike" + (i >= state.lives ? " lost" : "");
      els.hudLives.appendChild(spike);
    }
  }

  function renderQuestion() {
    const q = state.current;
    const topic = topicsById[q.topicId];
    const isEnToCz = q.direction === "en-cz";

    els.questionTopicIcon.textContent = topic.icon;
    els.questionTopicName.textContent = topic.name.en;
    els.questionDirection.textContent = isEnToCz ? "EN → CZ" : "CZ → EN";
    els.questionWord.textContent = isEnToCz ? q.en : q.cz;

    els.feedback.hidden = true;
    els.feedback.className = "feedback";
    els.btnNext.hidden = true;
    hideBubble();
    setMascotState("idle");

    if (state.mode === "multiple") {
      els.meadow.hidden = false;
      els.answerAreaTyped.hidden = true;
      renderMorsels();
    } else {
      els.meadow.hidden = true;
      els.answerAreaTyped.hidden = false;
      els.typedInput.value = "";
      els.typedInput.disabled = false;
      els.typedInput.className = "typed-input";
      els.typedInput.focus();
    }
  }

  // ---------- multiple choice: meadow morsels ----------

  function renderMorsels() {
    const q = state.current;
    const isEnToCz = q.direction === "en-cz";
    const targetKey = isEnToCz ? "cz" : "en";
    const correctAnswer = isEnToCz ? q.cz : q.en;

    const distractorSource = state.pool.filter(w => w !== q && normalize(w[targetKey]) !== normalize(correctAnswer));
    const distractors = shuffle(distractorSource).slice(0, 3).map(w => w[targetKey]);
    const options = shuffle([correctAnswer, ...distractors]);
    const slots = shuffle(MORSEL_SLOTS);
    const icons = shuffle(MORSEL_ICONS);

    els.meadow.innerHTML = "";
    options.forEach((optionText, i) => {
      const chip = document.createElement("div");
      chip.className = "morsel";
      chip.style.left = `${slots[i].x}%`;
      chip.style.top = `${slots[i].y}%`;
      chip.dataset.value = optionText;
      chip.innerHTML = `<span class="morsel-icon">${icons[i]}</span><span class="morsel-text">${optionText}</span>`;
      attachMorselDrag(chip, optionText);
      els.meadow.appendChild(chip);
    });
  }

  function attachMorselDrag(chip, value) {
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;

    chip.addEventListener("pointerdown", e => {
      if (state.answered) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      chip.classList.add("dragging");
      try { chip.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });

    chip.addEventListener("pointermove", e => {
      if (!dragging || state.answered) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) moved = true;
      chip.style.setProperty("--dx", `${dx}px`);
      chip.style.setProperty("--dy", `${dy}px`);
    });

    const endDrag = e => {
      if (!dragging) return;
      dragging = false;
      chip.classList.remove("dragging");
      if (state.answered) return;

      if (moved) {
        if (isOverlappingMascot(chip)) {
          commitMorsel(chip, value);
        } else {
          chip.style.setProperty("--dx", "0px");
          chip.style.setProperty("--dy", "0px");
        }
      } else {
        commitMorsel(chip, value);
      }
    };

    chip.addEventListener("pointerup", endDrag);
    chip.addEventListener("pointercancel", endDrag);
  }

  function isOverlappingMascot(chip) {
    const a = chip.getBoundingClientRect();
    const b = els.mascotWrap.getBoundingClientRect();
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
  }

  function commitMorsel(chip, value) {
    if (state.answered) return;
    els.meadow.querySelectorAll(".morsel").forEach(m => (m.style.pointerEvents = "none"));

    const q = state.current;
    const isEnToCz = q.direction === "en-cz";
    const correctAnswer = isEnToCz ? q.cz : q.en;
    const isCorrect = normalize(value) === normalize(correctAnswer);

    chip.classList.add(isCorrect ? "eaten" : "spoiled");
    if (!isCorrect) {
      const correctChip = [...els.meadow.querySelectorAll(".morsel")].find(
        m => normalize(m.dataset.value) === normalize(correctAnswer)
      );
      if (correctChip) correctChip.classList.add("reveal-correct");
    }

    resolveAnswer(isCorrect, correctAnswer);
  }

  // ---------- typed mode ----------

  function submitTyped() {
    if (state.answered) return;
    const value = els.typedInput.value;
    els.typedInput.disabled = true;

    const q = state.current;
    const isEnToCz = q.direction === "en-cz";
    const correctAnswer = isEnToCz ? q.cz : q.en;
    const isCorrect = normalize(value) === normalize(correctAnswer);

    els.typedInput.classList.add(isCorrect ? "correct" : "wrong");
    resolveAnswer(isCorrect, correctAnswer);
  }

  // ---------- shared scoring / mascot reactions ----------

  function resolveAnswer(isCorrect, correctAnswer) {
    state.answered = true;

    if (isCorrect) {
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      state.correctCount += 1;
      const bonus = Math.min(state.streak * 2, MAX_STREAK_BONUS);
      state.score += BASE_POINTS + bonus;
      showFeedback(true, `Correct! +${BASE_POINTS + bonus}${bonus ? ` (streak bonus +${bonus})` : ""}`);
      setMascotState("happy");
      showBubble(pick(HAPPY_LINES));
    } else {
      state.streak = 0;
      state.lives -= 1;
      showFeedback(false, `Wrong. Answer: ${correctAnswer}`);
      setMascotState("hurt");
      showBubble(pick(HURT_LINES));
    }

    updateHud();
    els.btnNext.hidden = false;
    els.btnNext.textContent = state.lives <= 0 ? "See results →" : "Continue the walk →";
  }

  function setMascotState(kind) {
    els.mascot.classList.remove("happy", "hurt");
    if (kind === "happy" || kind === "hurt") {
      els.mascot.classList.add(kind);
      window.setTimeout(() => els.mascot.classList.remove(kind), 650);
    }
  }

  function showBubble(text) {
    clearTimeout(bubbleTimer);
    els.mascotBubble.textContent = text;
    els.mascotBubble.hidden = false;
    bubbleTimer = window.setTimeout(hideBubble, 1400);
  }

  function hideBubble() {
    els.mascotBubble.hidden = true;
  }

  function showFeedback(isCorrect, text) {
    els.feedback.hidden = false;
    els.feedback.className = "feedback " + (isCorrect ? "correct" : "wrong");
    els.feedback.textContent = text;
  }

  function advance() {
    state.index += 1;
    nextQuestion();
  }

  function endGame() {
    const total = state.queue.length;
    const accuracy = total ? Math.round((state.correctCount / total) * 100) : 0;
    const outOfLives = state.lives <= 0;

    els.resultTitle.textContent = outOfLives ? "Out of lives! 💔" : "Round complete! 🎉";
    els.resultScore.textContent = state.score;
    els.resultAccuracy.textContent = `${accuracy}%`;
    els.resultBestStreak.textContent = state.bestStreak;

    if (outOfLives) {
      els.resultMascot.textContent = "🦔💤";
      els.resultStory.textContent = "Žofinka je unavená a stočila se do klubíčka na spaní. Zkus to znovu zítra!";
    } else if (accuracy >= 80) {
      els.resultMascot.textContent = "🦔✨";
      els.resultStory.textContent = "Žofinka má plnou spížku na zimu! Skvělá procházka zahradou.";
    } else {
      els.resultMascot.textContent = "🦔";
      els.resultStory.textContent = "Pěkná procházka zahradou! Příště to bude ještě lepší.";
    }

    const prevHigh = getHighScore();
    const isNewHigh = state.score > prevHigh;
    if (isNewHigh) setHighScore(state.score);
    els.resultNewHigh.hidden = !isNewHigh;
    els.highScoreValue.textContent = getHighScore();

    showScreen("result");
  }

  // ---------- events ----------

  els.btnSubmitTyped.addEventListener("click", submitTyped);
  els.typedInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (!state.answered) submitTyped();
      else advance();
    }
  });

  els.btnNext.addEventListener("click", advance);

  els.btnPlayAgain.addEventListener("click", startGame);
  els.btnChangeSettings.addEventListener("click", () => showScreen("setup"));

  document.addEventListener("keydown", e => {
    if (!els.screenQuiz.classList.contains("active")) return;
    if (state.mode === "multiple" && !state.answered && ["1", "2", "3", "4"].includes(e.key)) {
      const idx = Number(e.key) - 1;
      const chips = els.meadow.querySelectorAll(".morsel");
      if (chips[idx]) commitMorsel(chips[idx], chips[idx].dataset.value);
    } else if (e.key === "Enter" && state.answered && !els.btnNext.hidden) {
      advance();
    }
  });

  // ---------- init ----------
  initSetupScreen();
})();
