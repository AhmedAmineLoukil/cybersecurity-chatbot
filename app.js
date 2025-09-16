if (!window.__CHAT_WIRED__) {
  window.__CHAT_WIRED__ = true;

  document.addEventListener('DOMContentLoaded', () => {
    const chat  = document.getElementById('chat');
    const form  = document.getElementById('chat-form');
    const input = document.getElementById('user-input');
    const clearBtn = document.getElementById('clear-btn');

    if (!chat || !form || !input) {
      console.error('Missing required DOM elements (#chat, #chat-form, #user-input).');
      return;
    }

    function addMessage(role, text) {
      const div = document.createElement('div');
      div.className = `msg ${role}`;
      div.textContent = text;
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
    }

    async function sendMessage(message) {
      if (!message) return;

      addMessage('user', message);

      const thinking = document.createElement('div');
      thinking.className = 'msg assistant';
      thinking.textContent = '. . .';
      chat.appendChild(thinking);
      chat.scrollTop = chat.scrollHeight;

      try {
        const res = await fetch('chat.php', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ message })
        });
        const data = await res.json();
        thinking.remove();
        if (data.error) {
          addMessage('assistant', `Error: ${data.error}`);
        } else {
          addMessage('assistant', data.reply || '(no reply)');
        }
      } catch (err) {
        thinking.remove();
        addMessage('assistant', 'Network error. Check your server/PHP logs.');
      }
    }

    // Submit from the input box
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = input.value.trim();
      input.value = '';
      input.focus();
      await sendMessage(message);
    });

    // Clear button
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        chat.innerHTML = '';
      });
    }

    // SINGLE delegated handler for all Ask buttons (prevents multiple bindings)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.ask-btn');
      if (!btn) return;

      // prevent any enclosing form submission
      e.preventDefault();
      e.stopPropagation();

      const q = btn.dataset.q || btn.getAttribute('data-q');
      sendMessage(q);
    });
  });
}
