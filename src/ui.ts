import { dictate, registerPush, voiceAuthNotice } from './security';
import { ScifCallKit } from './calls';

const contacts = [
  { initials: 'AM', name: 'Alex Morgan', preview: 'Key rotation is complete.', time: '09:42', color: 'mint', unread: true },
  { initials: 'JP', name: 'Jordan Park', preview: 'Call you after the briefing.', time: '08:16', color: 'blue', unread: false },
  { initials: 'SK', name: 'Samira Khan', preview: 'Encrypted attachment received', time: 'Yesterday', color: 'violet', unread: false },
  { initials: 'OPS', name: 'Ops channel', preview: 'Mira: endpoint check passed', time: 'Yesterday', color: 'amber', unread: false }
];

const icons = {
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.4"/><path d="m16 16 4 4"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M7 3H4c-.6 0-1 .4-1 1 0 9.4 7.6 17 17 17 .6 0 1-.4 1-1v-3l-4.5-2-2 2a14 14 0 0 1-6.5-6.5l2-2L8 3.5 7 3Z"/></svg>',
  video: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0m-7 7v3m-4 0h8"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>'
};

function avatar(contact: typeof contacts[number], extra = ''): string {
  return `<div class="avatar ${contact.color} ${extra}">${contact.initials}</div>`;
}

export function initializeApp(root: HTMLElement): void {
  root.innerHTML = `
    <aside class="sidebar">
      <div class="brand"><div class="brand-icon"><img src="/scif-mobile-mark.svg" alt="" /></div><div><b>SCIF <span class="brand-mobile">MOBILE</span></b><small>PRIVATE NETWORK</small></div></div>
      <div class="profile"><div class="profile-avatar">RM</div><div class="profile-text"><strong>Riley Morgan</strong><small>Personal workspace</small></div><span class="online-dot"></span></div>
      <div class="section-label">COMMUNICATIONS <button class="tiny-action" title="New message">${icons.plus}</button></div>
      <nav class="nav"><button class="nav-item active" data-screen="messages"><span class="nav-icon">▤</span> Messages <span class="nav-count">2</span></button><button class="nav-item" data-screen="calls"><span class="nav-icon">${icons.phone}</span> Calls</button><button class="nav-item" data-screen="email"><span class="nav-icon">✉</span> Secure email</button><button class="nav-item" data-screen="files"><span class="nav-icon">▧</span> Shared files</button></nav>
      <div class="section-label contacts-title">RECENT CONTACTS <button class="tiny-action" title="Add contact">${icons.plus}</button></div>
      <div class="contact-list">${contacts.map((c, i) => `<button class="contact-row ${i === 0 ? 'selected' : ''}" data-contact="${i}">${avatar(c)}<span class="contact-copy"><strong>${c.name}</strong><small>${c.preview}</small></span><span class="contact-meta"><small>${c.time}</small>${c.unread ? '<i></i>' : ''}</span></button>`).join('')}</div>
      <div class="sidebar-bottom"><div class="sidebar-security">${icons.lock}<span>End-to-end encryption<br><b>Session protected</b></span><span class="check-mark">✓</span></div><button class="settings-button"><span>⚙</span> Settings <span class="shortcut">⌘ ,</span></button></div>
    </aside>
    <main class="main-area">
      <header class="topbar"><div class="mobile-brand"><img src="/scif-mobile-mark.svg" alt="" /><b>SCIF <span>MOBILE</span></b></div><div class="top-heading"><span class="eyebrow">SECURE MESSAGING</span><h1>Messages</h1></div><div class="top-actions"><button class="icon-btn" title="Search">${icons.search}</button><button class="network-status"><i></i> PRIVATE CONNECTION</button><button class="user-mini">RM</button></div></header>
      <div class="workspace">
        <section class="conversation">
          <div class="conversation-head"><div class="person-heading">${avatar(contacts[0], 'large')}<div><h2>Alex Morgan <span class="verified">✓</span></h2><p><i></i> Available · SCIF contact</p></div></div><div class="call-actions"><button class="call-btn" data-action="audio">${icons.phone}<span>Voice</span></button><button class="call-btn primary" data-action="video">${icons.video}<span>Video</span></button><button class="icon-btn" title="More actions">${icons.more}</button></div></div>
          <div class="secure-banner">${icons.lock}<span><b>End-to-end encrypted</b><small>Only you and Alex can read or listen to this conversation.</small></span><button class="banner-info" title="Security details">ⓘ</button></div>
          <div class="message-feed"><div class="date-divider"><span>TODAY · 09:38</span></div><div class="message received"><div class="message-sender">Alex Morgan <span>09:38</span></div><p>Morning. The access review is finished. I rotated the shared keys and confirmed the devices are current.</p></div><div class="message sent"><div class="message-sender">You <span>09:40 <i class="delivered">✓✓</i></span></div><p>Thanks. Did the field team get the updated secure channel details?</p></div><div class="message received"><div class="message-sender">Alex Morgan <span>09:42</span></div><p>Yes, confirmed with each person on the approved roster. I'll send the summary through secure email.</p><div class="attachment">${icons.lock}<span><b>Access review summary</b><small>Encrypted document · 248 KB</small></span><span class="download-mark">↓</span></div></div><div class="typing"><span></span><span></span><span></span><small>Alex is typing</small></div></div>
          <div class="composer"><div class="composer-toolbar"><button title="Attach file">＋</button><button title="Record voice message" data-action="voice">${icons.mic}</button><span class="composer-encryption">${icons.lock} Encrypted</span><button title="More options">${icons.more}</button></div><textarea id="message-input" placeholder="Write a secure message…" rows="1"></textarea><div class="composer-bottom"><span>Messages are protected in transit and at rest when connected to a configured service.</span><button id="send-button" class="send-btn">${icons.send}</button></div></div>
        </section>
        <aside class="details-panel"><div class="details-head"><span>CONVERSATION DETAILS</span><button class="icon-btn" title="More">${icons.more}</button></div><div class="detail-person">${avatar(contacts[0], 'detail-avatar')}<h3>Alex Morgan</h3><p>SCIF contact · Verified</p><button class="detail-profile">View profile</button></div><div class="detail-block"><div class="block-title">SECURITY STATUS <span class="secure-pill">SECURE</span></div><div class="security-item"><span class="security-icon">${icons.lock}</span><span><b>End-to-end encryption</b><small>Active for this conversation</small></span></div><div class="security-item"><span class="security-icon">⌁</span><span><b>Identity verified</b><small>Safety number confirmed</small></span></div><button class="fingerprint">Show safety number <span>→</span></button></div><div class="detail-block"><div class="block-title">VOICE & IDENTITY</div><div class="security-item"><span class="security-icon">${icons.mic}</span><span><b>Voice dictation</b><small>Optional device speech service</small></span></div><div class="voice-note">${icons.shield}<span>Voice matching is not enabled. Use device biometrics or passkeys for sign-in; voice is not a reliable identity factor.</span></div><button class="voice-auth" id="voice-auth">Learn about voice security <span>↗</span></button></div><div class="detail-block"><div class="block-title">SHARED MEDIA <button>View all</button></div><div class="media-grid"><div class="media-thumb photo-one">▧</div><div class="media-thumb photo-two">▧</div><div class="media-thumb file-thumb">PDF</div></div></div><div class="privacy-note">${icons.shield}<span><b>Privacy, by design</b><small>No contact uploads. No ad tracking.</small></span></div></aside>
      </div>
      <footer class="app-footer"><span>${icons.shield} SCIF PRIVATE NETWORK</span><span>PROTOTYPE · NOT FOR CLASSIFIED OR EMERGENCY USE</span><span>CONNECTION ENCRYPTION REQUIRES CONFIGURED BACKEND</span></footer>
    </main>
    <div class="toast" id="toast" role="status"></div>
    <dialog id="voice-dialog"><form method="dialog"><button class="dialog-close" aria-label="Close">×</button><div class="dialog-icon">${icons.mic}</div><span class="eyebrow">VOICE DICTATION</span><h2>Speak a message</h2><p>Speech recognition availability depends on the device and may use its online speech service. Do not dictate passwords, codes, or sensitive content.</p><div class="dictation-result" id="dictation-result">Your transcript appears here after you choose Start.</div><button class="start-dictation" type="button" id="start-dictation">Start dictation</button><button class="dialog-cancel">Close</button></form></dialog>
  `;

  let toastTimer = 0;
  const toast = (message: string) => {
    const node = document.querySelector<HTMLElement>('#toast')!;
    node.textContent = message;
    node.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => node.classList.remove('visible'), 3600);
  };

  document.querySelectorAll<HTMLElement>('.nav-item').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    if (button.dataset.screen !== 'messages') toast(`${button.textContent?.trim()} workspace is a scaffold; connect a secure service to enable it.`);
  }));
  document.querySelectorAll<HTMLElement>('[data-action="audio"], [data-action="video"]').forEach((button) => button.addEventListener('click', () => toast('Calling needs a configured encrypted signaling/media service and native call integration.')));
  document.querySelectorAll<HTMLElement>('[data-action="voice"]').forEach((button) => button.addEventListener('click', () => document.querySelector<HTMLDialogElement>('#voice-dialog')!.showModal()));
  document.querySelector('#voice-auth')?.addEventListener('click', () => toast(voiceAuthNotice));
  document.querySelector('#start-dictation')?.addEventListener('click', async () => {
    const result = document.querySelector<HTMLElement>('#dictation-result')!;
    result.textContent = 'Listening…';
    try {
      const dictation = await dictate();
      result.textContent = `“${dictation.transcript}” — ${dictation.warning}`;
      const input = document.querySelector<HTMLTextAreaElement>('#message-input')!;
      input.value = [input.value, dictation.transcript].filter(Boolean).join(' ');
    } catch (error) {
      result.textContent = error instanceof Error ? error.message : 'Dictation unavailable.';
    }
  });
  document.querySelector('#send-button')?.addEventListener('click', () => {
    const input = document.querySelector<HTMLTextAreaElement>('#message-input')!;
    if (!input.value.trim()) return;
    toast('Message is local prototype content only; no secure message service is connected.');
    input.value = '';
  });
  document.querySelector('.network-status')?.addEventListener('click', async () => {
    try {
      const token = await registerPush();
      toast(`Push registered. Device token: ${token.slice(0, 8)}… Send it only to your authenticated push backend.`);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Push registration failed.');
    }
  });
  document.querySelectorAll('.contact-row').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.contact-row').forEach((item) => item.classList.remove('selected'));
    button.classList.add('selected');
    toast('Conversation switching is placeholder UI until the encrypted messaging backend is connected.');
  }));

  void ScifCallKit.addListener('incomingCall', ({ callerName }) => toast(`Incoming secure call: ${callerName}`));
}
