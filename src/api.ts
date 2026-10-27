import type { Envelope, WrappedPrivateKey } from './crypto';

const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1').replace(/\/$/, '');
export type Account = { id: string; username: string; publicKey: string; wrappedPrivateKey: WrappedPrivateKey };
export type Contact = { id: string; username: string; publicKey: string; addedAt?: string };
export type Message = { id: string; senderId: string; recipientId: string; envelope: Envelope; createdAt: string };
let token: string | null = null;

async function request<T>(path: string, options: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json');
  if (auth && token) headers.set('authorization', `Bearer ${token}`);
  let response: Response;
  try { response = await fetch(`${base}${path}`, { ...options, headers, cache: 'no-store' }); }
  catch { throw new Error(`Cannot reach SCIF service at ${base}. Start the backend and check its network URL.`); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Service returned ${response.status}.`);
  return body as T;
}

export async function register(username: string, password: string, publicKey: string, wrappedPrivateKey: WrappedPrivateKey): Promise<Account> {
  const result = await request<{ token: string; user: Account }>('/register', { method: 'POST', body: JSON.stringify({ username, password, publicKey, wrappedPrivateKey }) }, false);
  token = result.token;
  return result.user;
}

export async function login(username: string, password: string): Promise<Account> {
  const result = await request<{ token: string; user: Account }>('/login', { method: 'POST', body: JSON.stringify({ username, password }) }, false);
  token = result.token;
  return result.user;
}

export function logout(): void { token = null; }
export async function me(): Promise<{ id: string; username: string; publicKey: string }> { return request('/me'); }
export async function contacts(): Promise<Contact[]> { return (await request<{ contacts: Contact[] }>('/contacts')).contacts; }
export async function addContact(username: string): Promise<Contact> { return (await request<{ contact: Contact }>('/contacts', { method: 'POST', body: JSON.stringify({ username }) })).contact; }
export async function history(username: string): Promise<{ peer: Contact; messages: Message[] }> { return request(`/messages/${encodeURIComponent(username)}`); }
export async function sendMessage(recipient: string, envelopeSender: Envelope, envelopeRecipient: Envelope): Promise<Message> {
  return (await request<{ message: Message }>('/messages', { method: 'POST', body: JSON.stringify({ recipient, envelopeSender, envelopeRecipient }) })).message;
}
