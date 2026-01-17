import './style.css';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const state = {
  questions: [],
  currentQuestionIndex: 0,
  answers: {}, // { questionId: { isCorrect, selectedIndex, timestamp, errorTag } }
  mode: 'practice', // 'practice' | 'test'
  drawing: {
    isDrawing: false,
    tool: 'pen',
    color: 'black',
    history: [],
    historyStep: -1,
    enabled: true
  }
};

const dom = {
  app: document.getElementById('app'),
  startScreen: document.getElementById('start-screen'),
  resultsScreen: document.getElementById('results-screen'),
  btnPractice: document.getElementById('btn-practice'),
  btnTest: document.getElementById('btn-test'),
  btnRestart: document.getElementById('btn-restart'),
  scoreDisplay: document.getElementById('score-display'),
  reviewList: document.getElementById('review-list'),

  questionText: document.getElementById('question-text'),
  choicesArea: document.getElementById('choices-area'),
  feedbackArea: document.getElementById('feedback-area'),
  correctAnswerMath: document.getElementById('correct-answer-math'),
  explanationText: document.getElementById('explanation-text'),
  figureImg: document.getElementById('figure-img'),
  figurePlaceholder: document.getElementById('figure-placeholder'),
  canvas: document.getElementById('drawing-canvas'),
  progressBar: document.getElementById('progress-bar'),
  tools: {
    penBlack: document.getElementById('tool-pen-black'),
    penRed: document.getElementById('tool-pen-red'),
    eraser: document.getElementById('tool-eraser'),
    undo: document.getElementById('tool-undo'),
    clear: document.getElementById('tool-clear'),
    toggle: document.getElementById('toggle-drawing'),
  },
  modeDisplay: document.getElementById('mode-display')
};

async function init() {
  await loadQuestions();
  setupCanvas();
  setupEventListeners();
  // Show start screen initially
}

async function loadQuestions() {
  try {
    const response = await fetch('/questions.json'); // Vite serves files in 'public' at root
    state.questions = await response.json();
  } catch (e) {
    console.error('Failed to load questions', e);
    // dom.questionText.textContent = 'Error loading questions.'; // No longer needed here, start screen handles initial display
  }
}

function startGame(mode) {
  state.mode = mode;
  state.currentQuestionIndex = 0;
  state.answers = {};

  dom.startScreen.classList.add('hidden');
  dom.resultsScreen.classList.add('hidden');
  dom.modeDisplay.textContent = mode === 'practice' ? 'Practice Mode' : 'Test Mode';

  renderQuestion();
  renderProgressBar();
  window.clearCanvas();
}

function renderQuestion() {
  const q = state.questions[state.currentQuestionIndex];
  if (!q) return;

  dom.questionText.innerHTML = renderMath(q.prompt);
  dom.choicesArea.innerHTML = '';

  // Create or reuse shuffle logic
  // For Test Mode, we might want to shuffle questions themselves, but spec says "shuffle choices"
  let indices = q.choices.map((_, i) => i);
  // Always shuffle choices to prevent position memorization
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  indices.forEach(originalIndex => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.innerHTML = ` <span class="choice-marker"></span> ${renderMath(q.choices[originalIndex])}`;
    btn.onclick = () => handleChoice(originalIndex, btn);
    btn.ondblclick = () => handleChoice(originalIndex, btn, true);
    dom.choicesArea.appendChild(btn);
  });

  if (q.figure) {
    dom.figureImg.src = q.figure;
    dom.figureImg.classList.remove('hidden');
    dom.figurePlaceholder.classList.add('hidden');
    dom.figureImg.onerror = () => {
      dom.figureImg.classList.add('hidden');
      dom.figurePlaceholder.classList.remove('hidden');
    };
  } else {
    dom.figureImg.classList.add('hidden');
    dom.figurePlaceholder.classList.remove('hidden');
  }

  // Hide explanation initially
  dom.feedbackArea.classList.add('hidden');

  // Show explanation if in Practice mode and already answered
  const existingAns = state.answers[q.id];
  if (state.mode === 'practice' && existingAns) {
    // Re-show feedback if revisiting
    renderExplanation(q);
    dom.feedbackArea.classList.remove('hidden');
  }

  // Clear canvas only if moving to a new question not visited? 
  // For now, simplicity: clear canvas on render
  // window.clearCanvas(); 
  // Ideally, we want to persist drawings per question but that requires saving canvas state relative to question ID.
  // Given "handwriting log" requirement, we'll implement simple persistence later if space permits.
  // For now, clear to keep it clean.
  window.clearCanvas();

  updateProgressBar();
}

function renderExplanation(q) {
  dom.correctAnswerMath.innerHTML = `<strong>正解:</strong> ${renderMath(q.answerLatex || '')}`;
  dom.explanationText.textContent = q.point || '';
}

function renderMath(text) {
  if (!text) return '';
  return text.replace(/\$([^$]+)\$/g, (match, formula) => {
    try {
      return katex.renderToString(formula, { throwOnError: false });
    } catch (e) {
      return match;
    }
  });
}

function renderProgressBar() {
  dom.progressBar.innerHTML = '';
  state.questions.forEach((q, idx) => {
    const el = document.createElement('div');
    el.className = 'progress-item';
    el.textContent = idx + 1;
    el.onclick = () => {
      // Navigation rules
      if (state.mode === 'practice') {
        // Free movement
        state.currentQuestionIndex = idx;
        renderQuestion();
      } else {
        // Test mode: Restricted movement
        // "Back is allowed for only the immediate previous question"
        if (idx === state.currentQuestionIndex - 1) {
          state.currentQuestionIndex = idx;
          renderQuestion();
        }
      }
    };
    dom.progressBar.appendChild(el);
  });
  updateProgressBar();
}

function updateProgressBar() {
  const items = dom.progressBar.children;
  Array.from(items).forEach((item, idx) => {
    item.className = 'progress-item';
    if (idx === state.currentQuestionIndex) item.classList.add('active');

    const ans = state.answers[state.questions[idx].id];
    if (ans) {
      if (state.mode === 'practice') {
        // Practice: Show Correct/Incorrect
        item.classList.add(ans.isCorrect ? 'correct' : 'incorrect');
      } else {
        // Test: Just show "answered" state (maybe distinct color? using 'active' or neutral)
        item.style.backgroundColor = '#4299e1'; // Blue to indicate answered
        item.style.color = 'white';
      }
    } else {
      item.style.backgroundColor = '';
      item.style.color = '';
    }
  });
}

function handleChoice(selectedIndex, btnElement, isConfirmed = false) {
  if (!isConfirmed) return; // Wait for double click

  const q = state.questions[state.currentQuestionIndex];

  // Prevent changing answer in Test mode if already answered?
  // Spec implies "Confirm action -> Next". So if we are back, maybe we can edit?
  // Let's assume once confirmed, it moves next. If we came back, we can change it?
  // For simplicity: Update answer entry.

  const isCorrect = selectedIndex === q.correctIndex;

  state.answers[q.id] = {
    isCorrect,
    selectedIndex,
    timestamp: Date.now()
  };

  if (state.mode === 'practice') {
    showFeedbackOverlay(isCorrect, () => {
      renderExplanation(q);
      dom.feedbackArea.classList.remove('hidden');
      // Auto next after feedback? Spec says "Instant indicator -> Next". 
      // BUT also says "Bottom: Answer & Explanation".
      // Re-interpreting: Flash indicator, then STAY on page with explanation shown?
      // Or Flash indicator, NEXT question. User must click back to see explanation.
      // Let's go with: Flash -> Next.
      setTimeout(() => nextQuestion(), 200);
    });
  } else {
    // Test mode: No feedback, just next
    nextQuestion();
  }
}

function showFeedbackOverlay(isCorrect, callback) {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'none', zIndex: '9999'
  });
  overlay.innerHTML = isCorrect
    ? '<div style="font-size:10rem; color:#48bb78; text-shadow:0 0 20px white;">⭕</div>'
    : '<div style="font-size:10rem; color:#f56565; text-shadow:0 0 20px white;">❌</div>';

  document.body.appendChild(overlay);

  setTimeout(() => {
    document.body.removeChild(overlay);
    if (callback) callback();
  }, 500); // 500ms spec
}

function nextQuestion() {
  updateProgressBar();
  if (state.currentQuestionIndex < state.questions.length - 1) {
    state.currentQuestionIndex++;
    renderQuestion();
  } else {
    finishGame();
  }
}

function finishGame() {
  if (state.mode === 'test') {
    showResults();
  } else {
    alert('Practice Round Finished!');
    dom.startScreen.classList.remove('hidden');
  }
}

function showResults() {
  dom.resultsScreen.classList.remove('hidden');
  dom.resultsScreen.scrollTop = 0;

  const total = state.questions.length;
  const correctCount = Object.values(state.answers).filter(a => a.isCorrect).length;
  dom.scoreDisplay.textContent = `Score: ${correctCount} / ${total}`;

  dom.reviewList.innerHTML = '';

  state.questions.forEach((q, i) => {
    const ans = state.answers[q.id];
    const isCorrect = ans && ans.isCorrect;

    const item = document.createElement('div');
    item.className = 'review-item';

    const header = document.createElement('div');
    header.className = 'review-header';
    header.innerHTML = `
        <span style="font-weight:bold; color: ${isCorrect ? '#48bb78' : '#f56565'}">
            Q${i + 1}. ${isCorrect ? '正解' : '不正解'}
        </span>
      `;
    item.appendChild(header);

    const content = document.createElement('div');
    content.innerHTML = `<small>${q.prompt}</small><br/>`;
    if (q.answerLatex) {
      content.innerHTML += `<div style="margin-top:4px;">正解式: ${renderMath(q.answerLatex)}</div>`;
    }
    item.appendChild(content);

    // Error Analysis Tags for incorrect answers
    if (!isCorrect) {
      const tagsDiv = document.createElement('div');
      tagsDiv.className = 'tag-select';
      tagsDiv.innerHTML = '<span style="font-size:0.8rem; color:#718096">原因:</span>';

      ['立式ミス', '計算ミス', '読み落とし'].forEach(tag => {
        const tagBtn = document.createElement('button');
        tagBtn.className = 'tag-option';
        tagBtn.textContent = tag;
        if (ans && ans.errorTag === tag) tagBtn.classList.add('selected');

        tagBtn.onclick = () => {
          // Toggle tag
          if (ans) { // Ensure ans exists before modifying
            if (ans.errorTag === tag) ans.errorTag = null;
            else ans.errorTag = tag;
          }

          // Update UI
          Array.from(tagsDiv.querySelectorAll('.tag-option')).forEach(b => b.classList.remove('selected'));
          if (ans && ans.errorTag) tagBtn.classList.add('selected');
        };
        tagsDiv.appendChild(tagBtn);
      });
      item.appendChild(tagsDiv);
    }

    dom.reviewList.appendChild(item);
  });
}

function setupCanvas() {
  const ctx = dom.canvas.getContext('2d');

  function resize() {
    const parent = dom.canvas.parentElement;
    dom.canvas.width = parent.clientWidth;
    dom.canvas.height = parent.clientHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  let isPainting = false;

  dom.canvas.addEventListener('mousedown', startPosition);
  dom.canvas.addEventListener('mouseup', finishedPosition);
  dom.canvas.addEventListener('mousemove', draw);

  dom.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startPosition(e.touches[0]); });
  dom.canvas.addEventListener('touchend', (e) => { e.preventDefault(); finishedPosition(); });
  dom.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e.touches[0]); });

  function startPosition(e) {
    if (!state.drawing.enabled) return;
    isPainting = true;
    draw(e);
  }

  function finishedPosition() {
    isPainting = false;
    ctx.beginPath();
  }

  function draw(e) {
    if (!isPainting || !state.drawing.enabled) return;

    const rect = dom.canvas.getBoundingClientRect();
    const x = (e.clientX || e.pageX) - rect.left;
    const y = (e.clientY || e.pageY) - rect.top;

    ctx.lineWidth = state.drawing.tool === 'eraser' ? 20 : 3;
    ctx.lineCap = 'round';

    if (state.drawing.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = state.drawing.color;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  window.clearCanvas = () => ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
}

function setupEventListeners() {
  dom.tools.penBlack.onclick = () => { state.drawing.tool = 'pen'; state.drawing.color = 'black'; updateToolUI('tool-pen-black'); };
  dom.tools.penRed.onclick = () => { state.drawing.tool = 'pen'; state.drawing.color = 'red'; updateToolUI('tool-pen-red'); };
  dom.tools.eraser.onclick = () => { state.drawing.tool = 'eraser'; updateToolUI('tool-eraser'); };
  dom.tools.clear.onclick = () => { window.clearCanvas(); };
  dom.tools.undo.onclick = () => { alert('Undo not implemented in this version'); };
  dom.tools.toggle.onclick = () => {
    state.drawing.enabled = !state.drawing.enabled;
    dom.tools.toggle.classList.toggle('active');
    dom.tools.toggle.textContent = state.drawing.enabled ? 'Draw: ON' : 'Draw: OFF';
  };

  dom.btnPractice.onclick = () => startGame('practice');
  dom.btnTest.onclick = () => startGame('test');
  dom.btnRestart.onclick = () => {
    dom.resultsScreen.classList.add('hidden');
    dom.startScreen.classList.remove('hidden');
  };
}

function updateToolUI(activeId) {
  ['tool-pen-black', 'tool-pen-red', 'tool-eraser'].forEach(id => {
    const el = document.getElementById(id);
    if (id === activeId) el.classList.add('active');
    else el.classList.remove('active');
  });
}

init();
