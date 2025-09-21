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
// Recording UI helpers
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
    input.value = ''; // fresh transcript
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
    stop() { clearInterval(timer); div.remove(); },
    replaceWith(text) { clearInterval(timer); div.textContent = text; chatEl.scrollTop = chatEl.scrollHeight; }
  };
}

// =====================
// TTS (forced English)
// =====================
function speak(text, opts = {}) {
  if (!('speechSynthesis' in window) || !text?.trim()) return;
  try { speechSynthesis.cancel(); } catch {}
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; // Force English voice
  if (opts.rate)  u.rate  = opts.rate;
  if (opts.pitch) u.pitch = opts.pitch;
  speechSynthesis.speak(u);
}
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
// Main send flow (Enter/Send triggers this)
// =====================
let sendLocked = false;

async function handleSubmitText(text) {
  if (sendLocked) return;
  sendLocked = true;

  // If a mic session left UI “recording…”, clear it now
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
    speak(reply); // Speak bot reply in English
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

// Submit via button / Enter (guard against recording)
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (micState.isListening) {
    showStatus('Still listening… click the mic to stop, then press Enter.', 'info');
    return;
  }
  const text = input.value.trim();
  if (!text) return;
  handleSubmitText(text);
});

// Guarantee Enter == Send, regardless of focus (prevents Enter from clicking mic)
form.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (micState.isListening) {
    showStatus('Still listening… click the mic to stop, then press Enter.', 'info');
    return;
  }
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
// Speech Recognition (dictation only, continuous with auto-restart)
// =====================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const micState = {
  recognition: null,
  isListening: false,
  restartTimer: null,
  finalTranscript: ''
};

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

function beginRecognition() {
  if (!SpeechRecognition) {
    showStatus('Speech recognition not supported in this browser.', 'error');
    return;
  }

  // Clean up old instance
  if (micState.recognition) {
    try { micState.recognition.onend = null; micState.recognition.stop(); } catch {}
  }

  const r = new SpeechRecognition();
  r.lang = 'en-US';           // Force English recognition
  r.continuous = true;        // Keep listening across pauses
  r.interimResults = true;
  r.maxAlternatives = 1;
  micState.recognition = r;
  micState.finalTranscript = '';

  r.onstart = () => {
    micState.isListening = true;
    micBtn.classList.add('recording');
    markInputRecording(true);
    input.focus();

    // Disable native validation while dictating (prevents “Please fill out this field”)
    form.setAttribute('novalidate', '');
    input._wasRequired = input.required;
    input.required = false;

    showStatus('Listening… speak normally.', 'info');
  };

  r.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) {
        micState.finalTranscript = (micState.finalTranscript + ' ' + res[0].transcript)
          .replace(/\s+/g, ' ').trim();
      } else {
        interim += res[0].transcript;
      }
    }
    input.value = (micState.finalTranscript + (interim ? ' ' + interim : ''))
      .replace(/\s+/g, ' ')
      .trimStart();
  };

  r.onerror = (e) => {
    console.warn('Speech error:', e.error);
    // Try to recover from benign errors
    if (['no-speech','audio-capture','network','aborted'].includes(e.error)) {
      scheduleRestart();
      return;
    }
    showStatus(`Speech error: ${e.error}`, 'error');
    hardStopListening();
  };

  r.onend = () => {
    // Engine often ends after short silence; keep session alive if user still recording
    if (micState.isListening) scheduleRestart();
    else cleanupRecordingUI();
  };

  try { r.start(); }
  catch (err) {
    console.error('recognition.start() failed', err);
    scheduleRestart();
  }

  function scheduleRestart() {
    clearTimeout(micState.restartTimer);
    if (micState.isListening) micState.restartTimer = setTimeout(() => {
      try { r.start(); }
      catch (err) {
        console.warn('restart failed, retrying', err);
        scheduleRestart();
      }
    }, 150); // tiny gap keeps it seamless
  }
}

function hardStopListening() {
  micState.isListening = false;
  clearTimeout(micState.restartTimer);
  try { micState.recognition && micState.recognition.stop(); } catch {}
  cleanupRecordingUI();
}

function cleanupRecordingUI() {
  micBtn.classList.remove('recording');
  markInputRecording(false);
  input.focus();

  // Restore validation behavior
  form.removeAttribute('novalidate');
  if (input._wasRequired !== undefined) {
    input.required = input._wasRequired;
    delete input._wasRequired;
  }
  showStatus('Stopped listening. Press Enter to send.', 'info');
}

// Mic button click: toggle listening; never auto-send; avoid grabbing Enter focus
micBtn.addEventListener('click', async () => {
  micBtn.blur(); // prevent Enter from "clicking" mic
  input.focus();

  // Toggle off if already recording
  if (micState.isListening) { hardStopListening(); return; }

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

  beginRecognition();
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
