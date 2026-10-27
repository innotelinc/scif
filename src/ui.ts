import { addContact, contacts, history, login, logout, me, register, sendMessage, type Account, type Contact, type Message } from './api';
import { createIdentity, decryptEnvelope, encryptForBoth, fingerprint, unlockIdentity, type Identity } from './crypto';
import { dictate } from './security';

const icon = '<svg viewBox="0 0 24 24"><path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>';
const sendIcon = '<svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/></svg>';

export function initializeApp(root: HTMLElement): void {
  root.innerHTML = `
    <main class="auth-page" id="auth-page"><form class="auth-card" id="auth-form"><div class="brand"><img src="/scif-mobile-mark.svg" alt=""><b>SCIF <small>MOBILE</small></b></div><span class="eyebrow">PRIVATE DIRECT MESSAGING</span><h1 id="auth-title">Sign in</h1><p class="muted">Messages are encrypted on your device before they reach the service. Your account passphrase cannot be reset by SCIF.</p><label>Username<input id="auth-username" autocomplete="username" minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" required placeholder="your_username"></label><label>Account passphrase<input id="auth-password" type="password" autocomplete="current-password" minlength="12" maxlength="1024" required placeholder="At least 12 characters"></label><div class="auth-error" id="auth-error" role="alert"></div><button class="primary-action" id="auth-submit" type="submit">Sign in</button><button class="text-action" id="auth-switch" type="button">Create a new account</button><p class="warning-note">Lost passphrase means lost messages. Keep a secure offline backup; there is no password reset.</p></form></main>
    <main class="app-shell hidden" id="app-shell"><aside class="sidebar"><div class="brand"><img class="brand-logo" src="/scif-mobile-mark.svg" alt=""><b>SCIF <small>MOBILE</small></b></div><div class="profile"><div class="profile-avatar" id="user-initials">?</div><div class="profile-text"><strong id="user-name">Loading</strong><small>Encrypted account</small></div></div><div class="section-label">DIRECT CONTACTS <button class="tiny-action" id="add-contact-open" title="Add contact">＋</button></div><form class="add-contact hidden" id="add-contact-form"><input id="new-contact" placeholder="username" maxlength="24" autocomplete="off"><button type="submit">Add</button></form><div class="contact-list" id="contact-list"></div><div class="sidebar-bottom"><div class="sidebar-security">${icon}<span>Message bodies are<br><b>encrypted on device</b></span></div><button class="settings-button" id="logout">Sign out</button></div></aside><section class="main-area"><header class="topbar"><div class="top-heading"><span class="eyebrow">SCIF MOBILE · DIRECT MESSAGE</span><h1 id="conversation-title">Choose a contact</h1></div><div class="top-actions"><span class="connection" id="connection">Checking service…</span></div></header><div class="notice" id="notice">SCIF encrypts message content in your app. Usernames, timing, and message sizes remain visible to the service.</div><div class="verification hidden" id="verification"></div><div class="message-feed" id="message-feed"><div class="empty-state"><div>${icon}</div><h2>No demo messages</h2><p>Add a SCIF username and open that conversation. New accounts can only message other registered accounts.</p></div></div><form class="composer" id="composer"><div class="composer-meta"><span id="composer-peer">Select a contact to message</span><button type="button" id="dictate">Voice dictation</button><span>Encrypted before send</span></div><textarea id="message-input" maxlength="4000" rows="2" placeholder="Write a message…" disabled></textarea><div class="composer-bottom"><small>Never send emergency or classified information. This service has not had an independent security audit.</small><button class="send-btn" type="submit" disabled id="send-button">${sendIcon}<span>Send</span></button></div></form><footer class="app-footer"><span>${icon} SCIF MOBILE</span><span>CALLS, SMS/MMS, EMAIL, BLUETOOTH AND PUSH CALLING ARE NOT IMPLEMENTED</span></footer></section></main><div class="toast" id="toast" role="status"></div>
  `;
  let mode: 'login' | 'register' = 'login';
  let account: Account | null = null;
  let identity: Identity | null = null;
  let selected: Contact | null = null;
  let pollTimer = 0;
  const $ = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const notice = (message: string, bad = false) => {
    const node = $('#toast'); node.textContent = message; node.classList.toggle('bad', bad); node.classList.add('visible');
    window.setTimeout(() => node.classList.remove('visible'), 5000);
  };
  const setAuthError = (message: string) => { $('#auth-error').textContent = message; };
  const describeService = async () => {
    try {
      const response = await fetch((import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1').replace(/\/api\/v1\/?$/, '/healthz'));
      $('#connection').textContent = response.ok ? 'SERVICE ONLINE · TLS REQUIRED IN PRODUCTION' : 'SERVICE UNAVAILABLE';
      $('#connection').classList.toggle('online', response.ok);
    } catch { $('#connection').textContent = 'SERVICE UNREACHABLE'; $('#connection').classList.remove('online'); }
  };
  const drawContacts = async () => {
    const items = await contacts();
    const list = $('#contact-list'); list.replaceChildren();
    for (const contact of items) {
      const button = document.createElement('button'); button.className = `contact-row ${selected?.id === contact.id ? 'selected' : ''}`;
      const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = contact.username.slice(0, 2).toUpperCase();
      const label = document.createElement('span'); label.className = 'contact-copy';
      const name = document.createElement('strong'); name.textContent = contact.username;
      const sub = document.createElement('small'); sub.textContent = 'SCIF account';
      label.append(name, sub); button.append(avatar, label);
      button.addEventListener('click', () => { void openConversation(contact); }); list.append(button);
    }
  };
  const openConversation = async (contact: Contact) => {
    selected = contact; $('#conversation-title').textContent = `@${contact.username}`; $('#composer-peer').textContent = `Encrypted to @${contact.username}`;
    $('#message-input').removeAttribute('disabled'); $('#send-button').removeAttribute('disabled');
    const peerFingerprint = await fingerprint(contact.publicKey);
    let pins: Record<string, string> = {};
    try { pins = JSON.parse(localStorage.getItem('scif.peer-pins') || '{}') as Record<string, string>; }
    catch { localStorage.removeItem('scif.peer-pins'); }
    const previous = pins[contact.id];
    const verification = $('#verification'); verification.classList.remove('hidden');
    verification.textContent = previous && previous !== peerFingerprint
      ? `WARNING: @${contact.username} key changed. Stop messaging and verify with them out of band. Current fingerprint: ${peerFingerprint}`
      : `Verify @${contact.username} safety fingerprint in person or through a separate trusted channel: ${peerFingerprint}. First-use identity is not verified by the server.`;
    if (!previous) { pins[contact.id] = peerFingerprint; localStorage.setItem('scif.peer-pins', JSON.stringify(pins)); }
    await drawContacts(); await refreshMessages();
    window.clearInterval(pollTimer); pollTimer = window.setInterval(() => { void refreshMessages().catch((e) => notice(e.message, true)); }, 5000);
  };
  const refreshMessages = async () => {
    if (!selected || !account || !identity) return;
    const result = await history(selected.username);
    const feed = $('#message-feed'); feed.replaceChildren();
    if (!result.messages.length) {
      const empty = document.createElement('div'); empty.className = 'empty-state compact'; empty.textContent = `This conversation with @${selected.username} has no messages yet.`; feed.append(empty); return;
    }
    for (const message of result.messages) {
      const fromSelf = message.senderId === account.id;
      const aad = [message.senderId, message.recipientId].sort().join(':');
      let text: string;
      try { text = await decryptEnvelope(message.envelope, identity, aad); }
      catch { text = '[Unable to authenticate/decrypt message. Check the contact key fingerprint.]'; }
      const bubble = document.createElement('article'); bubble.className = `message ${fromSelf ? 'sent' : 'received'}`;
      const meta = document.createElement('div'); meta.className = 'message-meta'; meta.textContent = `${fromSelf ? 'You' : `@${selected.username}`} · ${new Date(message.createdAt).toLocaleString()}`;
      const body = document.createElement('p'); body.textContent = text; bubble.append(meta, body); feed.append(bubble);
    }
    feed.scrollTop = feed.scrollHeight;
  };

  $('#auth-switch').addEventListener('click', () => {
    mode = mode === 'login' ? 'register' : 'login';
    $('#auth-title').textContent = mode === 'login' ? 'Sign in' : 'Create account';
    $('#auth-password').setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password');
    $('#auth-submit').textContent = mode === 'login' ? 'Sign in' : 'Create account';
    $('#auth-switch').textContent = mode === 'login' ? 'Create a new account' : 'I already have an account';
    ($('#auth-password') as HTMLInputElement).minLength = mode === 'register' ? 12 : 1; setAuthError('');
  });

  $('#auth-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = ($('#auth-username') as HTMLInputElement).value.trim().toLowerCase();
    const password = ($('#auth-password') as HTMLInputElement).value;
    const submit = $('#auth-submit') as HTMLButtonElement; submit.disabled = true; setAuthError('Working…');
    try {
      let user: Account;
      if (mode === 'register') {
        if (password.length < 12) throw new Error('Choose a passphrase with at least 12 characters.');
        const generated = await createIdentity(password);
        user = await register(username, password, generated.identity.publicKey, generated.wrappedPrivateKey);
        identity = generated.identity;
      } else {
        user = await login(username, password);
        identity = await unlockIdentity(password, user.publicKey, user.wrappedPrivateKey);
      }
      account = user;
      ($('#auth-password') as HTMLInputElement).value = '';
      ($('#auth-password') as HTMLInputElement).minLength = 1;
      $('#auth-page').classList.add('hidden'); $('#app-shell').classList.remove('hidden');
      $('#user-name').textContent = `@${user.username}`; $('#user-initials').textContent = user.username.slice(0, 2).toUpperCase();
      setAuthError(''); await drawContacts(); await describeService();
    } catch (error) { identity = null; setAuthError(error instanceof Error ? error.message : 'Account request failed.'); }
    finally { submit.disabled = false; }
  });
  $('#add-contact-open').addEventListener('click', () => { $('#add-contact-form').classList.toggle('hidden'); ($('#new-contact') as HTMLInputElement).focus(); });
  $('#add-contact-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await addContact(($('#new-contact') as HTMLInputElement).value.trim()); ($('#new-contact') as HTMLInputElement).value = ''; $('#add-contact-form').classList.add('hidden'); await drawContacts(); notice('Contact added. Verify their fingerprint out of band before sharing sensitive information.'); }
    catch (error) { notice(error instanceof Error ? error.message : 'Could not add contact.', true); }
  });
  $('#composer').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selected || !account || !identity) return;
    const input = $('#message-input') as HTMLTextAreaElement;
    const text = input.value.trim(); if (!text) return;
    const button = $('#send-button') as HTMLButtonElement; button.disabled = true;
    try {
      const aad = [account.id, selected.id].sort().join(':');
      const envelopes = await encryptForBoth(text, identity, selected.publicKey, aad);
      await sendMessage(selected.username, envelopes.envelopeSender, envelopes.envelopeRecipient);
      input.value = ''; await refreshMessages();
    } catch (error) { notice(error instanceof Error ? error.message : 'Message was not sent.', true); }
    finally { button.disabled = false; }
  });
  $('#dictate').addEventListener('click', async () => {
    try { const result = await dictate(); const input = $('#message-input') as HTMLTextAreaElement; input.value = `${input.value}${input.value ? ' ' : ''}${result.transcript}`; }
    catch (error) { notice(error instanceof Error ? error.message : 'Dictation unavailable.', true); }
  });
  $('#logout').addEventListener('click', () => { window.clearInterval(pollTimer); logout(); account = null; identity = null; selected = null; $('#app-shell').classList.add('hidden'); $('#auth-page').classList.remove('hidden'); });
  void describeService();
}
