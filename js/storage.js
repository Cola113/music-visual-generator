const SESSION_KEY = 'mooncut.session.v1';
const SESSION_ID_KEY = 'mooncut.session.id';
const DB_NAME = 'mooncut-session-assets';

export class SessionStore {
  constructor() {
    this.sessionId = null;
    this.problem = null;
    this.database = null;
    try {
      this.sessionId = sessionStorage.getItem(SESSION_ID_KEY) || crypto.randomUUID();
      sessionStorage.setItem(SESSION_ID_KEY, this.sessionId);
    } catch { this.problem = '浏览器阻止会话存储，刷新后无法恢复设置。'; }
  }

  read() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const state = JSON.parse(raw);
      return state.version === 1 ? state : null;
    } catch { this.problem = '会话设置无法读取，已使用默认设置。'; return null; }
  }

  save(state) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...state, version: 1 }));
      return true;
    } catch { this.problem = '会话保存失败，可能是存储空间不足。'; return false; }
  }

  async open() {
    if (this.database) return this.database;
    this.database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('assets');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('浏览器无法打开本地素材存储。'));
      request.onblocked = () => reject(new Error('本地素材存储被其他标签页阻塞。'));
    });
    return this.database;
  }

  async put(trackId, kind, blob) {
    if (!this.sessionId) throw new Error('会话存储不可用，素材只能在当前页面临时使用。');
    const database = await this.open();
    const key = `${this.sessionId}:${trackId}:${kind}`;
    await new Promise((resolve, reject) => {
      const tx = database.transaction('assets', 'readwrite');
      tx.objectStore('assets').put(blob, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(new Error('素材保存失败，可能是本地存储空间不足。'));
      tx.onabort = () => reject(new Error('素材保存被浏览器中止。'));
    });
    return key;
  }

  async get(key) {
    if (!key || !key.startsWith(`${this.sessionId}:`)) return null;
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const request = database.transaction('assets', 'readonly').objectStore('assets').get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error('本地素材恢复失败，请重新导入。'));
    });
  }
}
