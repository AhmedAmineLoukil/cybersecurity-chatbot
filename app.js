// =====================
// Chat UI elements
// =====================
const chatEl = document.getElementById('chat');
const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const micBtn = document.getElementById('micBtn');
const clearBtn = document.getElementById('clear-btn');
const statusEl = document.getElementById('status');

// =====================
// Status display helper
// =====================
function showStatus(message, type = 'info') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `status show ${type}`;
  setTimeout(() => statusEl.classList.remove('show'), 3000);
}

// =====================
// Recording UI helpers (bullet-proof)
// =====================
const DEFAULT_PLACEHOLDER = 'Type your message…';

function markInputRecording(on) {
  if (on) {
    if (!input.dataset.prevPlaceholder) {
      const current =
        input.placeholder && input.placeholder !== 'Recording…'
          ? input.placeholder
          : DEFAULT_PLACEHOLDER;
      input.dataset.prevPlaceholder = current;
    }
    input.placeholder = 'Recording…';
    input.classList.add('recording');
    // Fresh transcript while speaking
    input.value = '';
  } else {
    const prev = input.dataset.prevPlaceholder || DEFAULT_PLACEHOLDER;
    input.placeholder = prev;
    input.classList.remove('recording');
    delete input.dataset.prevPlaceholder;
  }
}

function clearRecordingUI() {
  micBtn.classList.remove('recording');
  const hadSnapshot = !!input.dataset.prevPlaceholder;
  markInputRecording(false);
  if (!hadSnapshot && input.placeholder === 'Recording…') {
    input.placeholder = DEFAULT_PLACEHOLDER;
    input.classList.remove('recording');
  }
}

// =====================
// Chat bubbles + Typing indicator
// =====================
function appendUserBubble(text) {
  const div = document.createElement('div');
  div.className = 'msg user';
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function appendAssistantBubble(text) {
  const div = document.createElement('div');
  div.className = 'msg assistant';
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

/** Assistant typing indicator: cycles ".", "..", "..." */
function startAssistantTyping() {
  const div = document.createElement('div');
  div.className = 'msg assistant';
  const span = document.createElement('span');
  span.setAttribute('aria-live', 'polite');
  span.textContent = '.';
  div.appendChild(span);
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;

  const frames = ['.', '..', '...'];
  let i = 0;
  const timer = setInterval(() => {
    span.textContent = frames[i++ % frames.length];
    chatEl.scrollTop = chatEl.scrollHeight;
  }, 400);

  return {
    stop() {
      clearInterval(timer);
      div.remove();
    },
    replaceWith(text) {
      clearInterval(timer);
      div.textContent = text;
      chatEl.scrollTop = chatEl.scrollHeight;
    }
  };
}

// =====================
// TTS (forced English, Edge-hardened)
// =====================
function getVoicesAsync() {
  return new Promise((resolve) => {
    const v = speechSynthesis.getVoices();
    if (v && v.length) return resolve(v);
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
  });
}
function resumeIfPaused() {
  try {
    if (speechSynthesis.paused) speechSynthesis.resume();
  } catch {}
}

// Speak using the browser's default voice (no manual selection)
function speak(text, opts = {}) {
  if (!('speechSynthesis' in window) || !text?.trim()) return;
  try { speechSynthesis.cancel(); } catch {}
  const u = new SpeechSynthesisUtterance(text);
  // Let the browser choose the voice; just set language to system default
  u.lang = navigator.language || 'en-US';
  if (opts.rate)  u.rate  = opts.rate;
  if (opts.pitch) u.pitch = opts.pitch;
  // DO NOT assign u.voice — the browser will use its default
  speechSynthesis.speak(u);
}


// Preload voice list after any user interaction (some browsers require a gesture)
window.addEventListener('click', () => {
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
}, { once: true });

// =====================
// Backend call → chat.php
// =====================
async function sendMessageToServer(message) {
  const res = await fetch('chat.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(`Bad JSON from server (HTTP ${res.status})`);
  }
  if (!res.ok || data.error) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data.reply || '(no content)';
}

// =====================
// Main send flow (with typing indicator "...")
// =====================
let sendLocked = false;

async function handleSubmitText(text) {
  if (sendLocked) return;
  sendLocked = true;

  // If a previous mic session left the UI “recording…”, clear it now
  clearRecordingUI();

  input.value = '';
  appendUserBubble(text);

  const typing = startAssistantTyping();

  const sendBtn = form.querySelector('button[type="submit"]');
  const prevSendDisabled = sendBtn ? sendBtn.disabled : false;
  const prevMicDisabled = micBtn.disabled;
  if (sendBtn) sendBtn.disabled = true;
  micBtn.disabled = true;

  try {
    const reply = await sendMessageToServer(text);
    typing.replaceWith(reply);
    // Speak in English (force)
    speak(reply);
  } catch (err) {
    console.error(err);
    typing.replaceWith('Sorry—there was a problem reaching the server.');
  } finally {
    clearRecordingUI();
    if (sendBtn) sendBtn.disabled = prevSendDisabled;
    micBtn.disabled = prevMicDisabled;
    sendLocked = false;
  }
}

// Submit via Send button / Enter
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  handleSubmitText(text);
});

// Preset Ask buttons
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.ask-btn');
  if (!btn) return;
  const q = btn.getAttribute('data-q') || '';
  if (!q) return;
  input.value = q;
  handleSubmitText(q);
});

// Clear chat
clearBtn.addEventListener('click', () => {
  chatEl.innerHTML = '';
  input.value = '';
  input.focus();
});

// =====================
// Speech Recognition (auto-send on end)
// =====================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;
let startedByMic = false;

async function ensureMicPermission() {
  if (!navigator.mediaDevices?.getUserMedia) return true; // older browsers
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    return true;
  } catch (err) {
    console.error('Mic permission denied:', err);
    return false;
  }
}

function startListening() {
  if (!SpeechRecognition) {
    showStatus('Speech recognition not supported', 'error');
    return;
  }
  if (isListening) { stopListening(); return; }

  try {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    // Choose the language you speak: 'fr-FR' for French, 'en-US' for English, etc.
    recognition.lang = 'fr-FR';

    recognition.onstart = () => {
      isListening = true;
      startedByMic = true;
      micBtn.classList.add('recording');
      markInputRecording(true);
      showStatus('Listening... speak now!', 'info');
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalTranscript += res[0].transcript;
        else interimTranscript += res[0].transcript;
      }
      input.value = (finalTranscript || interimTranscript).trim();
    };

    recognition.onerror = (event) => {
      console.error('Speech error:', event.error);
      showStatus(`Speech error: ${event.error}`, 'error');
      stopListening();
    };

    recognition.onend = () => {
      stopListening();
      // Auto-send what you said (this will also speak the reply)
      const text = input.value.trim();
      if (startedByMic && text) handleSubmitText(text);
      startedByMic = false;
    };

    recognition.start();
  } catch (error) {
    console.error('Failed to start recognition:', error);
    showStatus('Failed to start speech recognition', 'error');
  }
}

function stopListening() {
  if (recognition) { try { recognition.stop(); } catch {} }
  isListening = false;
  micBtn.classList.remove('recording');
  markInputRecording(false);
}

// Mic button click: immediate feedback + permission nudge + toggle
micBtn.addEventListener('click', async () => {
  // Toggle off if already recording
  if (micBtn.classList.contains('recording') || input.classList.contains('recording')) {
    stopListening();
    clearRecordingUI();
    return;
  }

  console.log('Mic button clicked');
  micBtn.classList.add('recording');
  markInputRecording(true);
  showStatus('Requesting microphone…', 'info');

  if (location.protocol === 'file:') {
    showStatus('Open via http://localhost — speech won’t work on file://', 'error');
    clearRecordingUI();
    return;
  }

  const ok = await ensureMicPermission();
  if (!ok) {
    showStatus('Microphone permission blocked. Allow it in site permissions.', 'error');
    clearRecordingUI();
    return;
  }

  if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
    showStatus('Speech recognition not supported in this browser.', 'error');
    clearRecordingUI();
    return;
  }

  startListening();
});

// =====================
// Startup checks & global error reporting
// =====================
document.addEventListener('DOMContentLoaded', () => {
  input.focus();
  if (location.protocol === 'file:') {
    showStatus('Open via http://localhost — speech will not work on file://', 'error');
  }
  if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
    showStatus('This browser does not support speech recognition.', 'error');
  }
});

window.addEventListener('error', (e) => {
  console.error('JS error:', e.message);
  showStatus('JS error: ' + e.message, 'error');
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Promise rejection:', e.reason);
  showStatus('Promise error: ' + (e.reason?.message || e.reason), 'error');
});
