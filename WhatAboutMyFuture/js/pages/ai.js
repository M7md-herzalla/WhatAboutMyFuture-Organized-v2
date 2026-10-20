// Academic guidance chat. The service address is configured once in js/config.js.
(() => {
  const messages = document.getElementById('chatMessages');
  const input = document.getElementById('userInput');
  const sendButton = document.getElementById('sendBtn');
  const suggestions = document.getElementById('suggestions');
  const errorNote = document.getElementById('errorNote');
  const systemPrompt = 'أنت مساعد ذكي متخصص في إرشاد طلاب الثانوية في الأردن لاختيار التخصص الجامعي المناسب. أجب باللغة العربية بأسلوب واضح ومختصر ومفيد.';
  let history = [];
  let isSending = false;

  function addMessage(text, sender) {
    const item = document.createElement('div');
    item.className = 'msg ' + sender;
    item.textContent = text;
    messages.append(item);
    messages.scrollTop = messages.scrollHeight;
  }
  function showTyping() {
    const item = document.createElement('div');
    item.className = 'msg typing';
    item.id = 'typingIndicator';
    item.setAttribute('aria-label', 'جاري تجهيز الإجابة');
    item.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    messages.append(item);
    messages.scrollTop = messages.scrollHeight;
  }

  async function sendMessage(value) {
    const text = value.trim();
    if (!text || isSending) return;
    if (text.length > 4000) {
      errorNote.textContent = 'اكتب سؤالًا لا يزيد على 4000 حرف.';
      errorNote.style.display = 'block';
      return;
    }
    isSending = true;
    sendButton.disabled = true;
    errorNote.style.display = 'none';
    suggestions.style.display = 'none';
    addMessage(text, 'user');
    input.value = '';
    showTyping();
    const userMessage = { role: 'user', parts: [{ text }] };
    // Keep nine complete exchanges plus the current question (19 messages).
    const contents = [...history.slice(-18), userMessage];
    try {
      const response = await fetch(window.APP_CONFIG.aiBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] }, contents
        })
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || 'تعذر الحصول على الإجابة.');
      }
      const reply = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('');
      if (!reply) throw new Error('لم تصل إجابة نصية. حاول إعادة صياغة السؤال.');
      history = [...contents, { role: 'model', parts: [{ text: reply }] }];
      addMessage(reply, 'bot');
    } catch (error) {
      errorNote.textContent = error.message || 'حدث خطأ أثناء الاتصال، حاول مرة أخرى.';
      errorNote.style.display = 'block';
    } finally {
      document.getElementById('typingIndicator')?.remove();
      isSending = false;
      sendButton.disabled = false;
      input.focus();
    }
  }
  sendButton.addEventListener('click', () => sendMessage(input.value));
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault(); sendMessage(input.value);
    }
  });
  suggestions.addEventListener('click', event => {
    const chip = event.target.closest('.suggestion-chip');
    if (chip) sendMessage(chip.textContent);
  });
})();
