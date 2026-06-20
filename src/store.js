'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { generateFingerprint } = require('./fingerprint');
const { normalizeProxy } = require('./proxyManager');
const vault = require('./vault');

// Local de armazenamento. Definido por setDataDir() a partir do Electron
// (app.getPath('userData')) para gravar fora da pasta do app.
let DATA_DIR = path.join(__dirname, '..', 'data');
let PROFILES_DIR = path.join(DATA_DIR, 'profiles');
let DB_FILE = path.join(DATA_DIR, 'store.json');
let VAULT_FILE = path.join(DATA_DIR, 'store.vault');

// Estado do vault (criptografia em repouso).
let vaultEnabled = false; // existe store.vault
let vaultKey = null;      // chave derivada (em memória após unlock/definir)
let vaultSalt = null;
let vaultParams = vault.PARAMS;
let locked = false;       // vault existe mas ainda não foi destrancado

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

const DEFAULT_STATUSES = [
  { id: 'new', name: 'Novo', color: '#8b97a7', builtin: true },
  { id: 'ready', name: 'Pronto', color: '#3b82f6', builtin: true },
  { id: 'active', name: 'Ativo', color: '#2ecc71', builtin: true },
  { id: 'warming', name: 'Aquecendo', color: '#f39c12', builtin: true },
  { id: 'banned', name: 'Banido', color: '#e74c3c', builtin: true },
  { id: 'paused', name: 'Pausado', color: '#9b59b6', builtin: true },
];

let db = {
  profiles: [],
  proxies: [],
  folders: [],
  statuses: [],
  tags: [],
  settings: { columns: null },
};

function setDataDir(dir) {
  DATA_DIR = dir;
  PROFILES_DIR = path.join(DATA_DIR, 'profiles');
  DB_FILE = path.join(DATA_DIR, 'store.json');
  VAULT_FILE = path.join(DATA_DIR, 'store.vault');
  init();
}

function ensureDirs() {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

function emptyDb() {
  return { profiles: [], proxies: [], folders: [], statuses: [], tags: [], settings: {} };
}
function normalizeDb() {
  if (!db.statuses || db.statuses.length === 0) db.statuses = DEFAULT_STATUSES.slice();
  db.profiles = db.profiles || [];
  db.proxies = db.proxies || [];
  db.folders = db.folders || [];
  db.tags = db.tags || [];
  db.settings = db.settings || {};
}

// Decide o estado inicial: se há vault, fica TRANCADO até unlock; senão, carrega plaintext.
function init() {
  ensureDirs();
  vaultKey = null; vaultSalt = null;
  if (fs.existsSync(VAULT_FILE)) {
    vaultEnabled = true; locked = true; db = emptyDb();
  } else {
    vaultEnabled = false; locked = false;
    loadPlain();
  }
}

function loadPlain() {
  ensureDirs();
  if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { db = emptyDb(); }
  } else {
    db = emptyDb();
  }
  normalizeDb();
  save();
}

function save() {
  if (locked) return; // travado: não há dados em claro para gravar
  ensureDirs();
  if (vaultEnabled && vaultKey) {
    fs.writeFileSync(VAULT_FILE, JSON.stringify(vault.encrypt(db, vaultKey, vaultSalt, vaultParams)));
  } else {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }
}

/* ------------------------------- VAULT ------------------------------ */
function vaultStatus() { return { hasVault: vaultEnabled, locked }; }
function isLocked() { return vaultEnabled && locked; }

function unlock(password) {
  if (!vaultEnabled) return { ok: true };
  try {
    const file = JSON.parse(fs.readFileSync(VAULT_FILE, 'utf8'));
    const salt = Buffer.from(file.salt, 'base64');
    const params = vault.paramsFromFile(file);
    const key = vault.deriveKey(password, salt, params);
    db = vault.decrypt(file, key); // lança se a senha estiver errada (GCM)
    normalizeDb();
    vaultKey = key; vaultSalt = salt; vaultParams = params; locked = false;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Senha incorreta' };
  }
}

function lock() {
  if (!vaultEnabled) return { ok: false, error: 'sem senha-mestra' };
  vaultKey = null; vaultSalt = null; db = emptyDb(); locked = true;
  return { ok: true };
}

function setMasterPassword(password) {
  if (locked) return { ok: false, error: 'destranque primeiro' };
  if (!password || password.length < 4) return { ok: false, error: 'senha muito curta (mín. 4)' };
  vaultSalt = crypto.randomBytes(16);
  vaultParams = vault.PARAMS;
  vaultKey = vault.deriveKey(password, vaultSalt, vaultParams);
  vaultEnabled = true; locked = false;
  save(); // grava store.vault
  try { fs.rmSync(DB_FILE, { force: true }); } catch (e) {} // remove o plaintext antigo
  return { ok: true };
}

function changeMasterPassword(oldPw, newPw) {
  if (!vaultEnabled || locked) return { ok: false, error: 'destranque primeiro' };
  const test = vault.deriveKey(oldPw, vaultSalt, vaultParams);
  if (test.length !== vaultKey.length || !crypto.timingSafeEqual(test, vaultKey)) return { ok: false, error: 'senha atual incorreta' };
  if (!newPw || newPw.length < 4) return { ok: false, error: 'nova senha muito curta' };
  vaultSalt = crypto.randomBytes(16);
  vaultKey = vault.deriveKey(newPw, vaultSalt, vaultParams);
  save();
  return { ok: true };
}

function removeMasterPassword(currentPw) {
  if (!vaultEnabled || locked) return { ok: false, error: 'destranque primeiro' };
  const test = vault.deriveKey(currentPw, vaultSalt, vaultParams);
  if (test.length !== vaultKey.length || !crypto.timingSafeEqual(test, vaultKey)) return { ok: false, error: 'senha incorreta' };
  vaultEnabled = false; vaultKey = null; vaultSalt = null;
  save(); // grava plaintext store.json
  try { fs.rmSync(VAULT_FILE, { force: true }); } catch (e) {}
  return { ok: true };
}

function userDataDir(id) {
  return path.join(PROFILES_DIR, id, 'userdata');
}

// Resolve o proxy efetivo do perfil (da biblioteca via proxyId, ou inline).
function resolveProxy(p) {
  if (p.proxyId) {
    const px = db.proxies.find((x) => x.id === p.proxyId);
    if (px) return px;
  }
  return p.proxy || null;
}

function decorate(p) {
  return { ...p, userDataDir: userDataDir(p.id), resolvedProxy: resolveProxy(p) };
}

/* ----------------------------- PROFILES ----------------------------- */

function listProfiles({ includeTrash = false } = {}) {
  return db.profiles
    .filter((p) => (includeTrash ? p.deletedAt : !p.deletedAt))
    .map(decorate);
}

function getProfile(id) {
  const p = db.profiles.find((x) => x.id === id);
  return p ? decorate(p) : null;
}

function createProfile(input = {}) {
  const id = uid();
  const fingerprint = input.fingerprint
    ? input.fingerprint
    : generateFingerprint({ os: input.os, region: input.region });
  const profile = {
    id,
    name: input.name || `Perfil ${db.profiles.filter((p) => !p.deletedAt).length + 1}`,
    notes: input.notes || '',
    avatar: input.avatar || null, // foto do perfil (data URL leve) exibida na lista
    status: input.status || 'new',
    tags: input.tags || [],
    folderId: input.folderId || null,
    pinned: false,
    mainWebsite: input.mainWebsite || null,
    startUrl: input.startUrl || '',
    proxyId: input.proxyId || null,
    proxy: input.proxyId ? null : normalizeProxy(input.proxy),
    fingerprint,
    createdAt: now(),
    updatedAt: now(),
    lastLaunchedAt: null,
    deletedAt: null,
  };
  db.profiles.push(profile);
  fs.mkdirSync(userDataDir(id), { recursive: true });
  save();
  return decorate(profile);
}

function updateProfile(id, patch = {}) {
  const p = db.profiles.find((x) => x.id === id);
  if (!p) return null;
  const fields = ['name', 'notes', 'avatar', 'status', 'tags', 'folderId', 'mainWebsite', 'startUrl', 'pinned'];
  for (const f of fields) if (patch[f] !== undefined) p[f] = patch[f];
  if (patch.proxyId !== undefined) {
    p.proxyId = patch.proxyId;
    if (patch.proxyId) p.proxy = null;
  }
  if (patch.proxy !== undefined && !patch.proxyId) {
    p.proxy = normalizeProxy(patch.proxy);
    p.proxyId = null;
  }
  if (patch.fingerprint !== undefined) p.fingerprint = patch.fingerprint;
  if (patch.regenerateFingerprint) {
    p.fingerprint = generateFingerprint({
      os: patch.os || p.fingerprint.os,
      region: patch.region || p.fingerprint.timezone,
    });
  }
  p.updatedAt = now();
  save();
  return decorate(p);
}

function markLaunched(id) {
  const p = db.profiles.find((x) => x.id === id);
  if (p) {
    p.lastLaunchedAt = now();
    save();
  }
}

// Guarda o último trust score calculado para o perfil (exibido na lista).
function setTrustScore(id, data) {
  const p = db.profiles.find((x) => x.id === id);
  if (p) { p.trustScore = data; save(); }
}

// Guarda a maturidade/qualidade do aquecimento (cookies, domínios, sites) — exibido na lista.
function setWarmth(id, data) {
  const p = db.profiles.find((x) => x.id === id);
  if (p) { p.warmth = data; save(); }
}

// Guarda a última auditoria de detecção (bateria local + oráculos externos).
function setDetectReport(id, data) {
  const p = db.profiles.find((x) => x.id === id);
  if (p) { p.detect = data; save(); }
}

// Guarda o último relatório de aquecimento (etapas, consentimentos, domínios, maturidade v2).
function setWarmReport(id, data) {
  const p = db.profiles.find((x) => x.id === id);
  if (p) { p.warmReport = data; save(); }
}

// Histórico de domínios recém-aquecidos (Fase 3): usado para DIVERSIFICAR a próxima execução.
// Mantém os mais recentes primeiro, com teto de 24 (não cresce indefinidamente).
function setWarmVisited(id, domains) {
  const p = db.profiles.find((x) => x.id === id);
  if (!p) return;
  const prev = (p.warmHistory && Array.isArray(p.warmHistory.domains)) ? p.warmHistory.domains : [];
  const merged = [...new Set([...(domains || []), ...prev])].filter(Boolean).slice(0, 24);
  p.warmHistory = { domains: merged, at: now() };
  save();
}

// Persiste a fingerprint estável (BrowserForge + WebGL/seeds) gerada na 1a abertura.
function setFingerprintData(id, data) {
  const p = db.profiles.find((x) => x.id === id);
  if (p) {
    p.fingerprint = p.fingerprint || {};
    p.fingerprint.bf = data.bf;
    p.fingerprint.stable = data.stable;
    save();
  }
}

// Clona um perfil em N copias, opcionalmente com fingerprint randomizada.
function cloneProfile(id, count = 1, randomize = true) {
  const src = db.profiles.find((x) => x.id === id);
  if (!src) return [];
  const created = [];
  for (let i = 1; i <= count; i++) {
    const fingerprint = randomize
      ? generateFingerprint({ os: src.fingerprint.os, region: src.fingerprint.timezone })
      : JSON.parse(JSON.stringify(src.fingerprint));
    const copy = createProfile({
      name: `${src.name} (cópia ${i})`,
      notes: src.notes,
      avatar: src.avatar,
      status: src.status,
      tags: src.tags.slice(),
      folderId: src.folderId,
      mainWebsite: src.mainWebsite,
      startUrl: src.startUrl,
      proxyId: src.proxyId,
      proxy: src.proxy,
      fingerprint,
    });
    created.push(copy);
  }
  return created;
}

// Acoes em massa de metadados.
function bulkSetStatus(ids, status) {
  ids.forEach((id) => updateProfile(id, { status }));
}
function bulkAddTag(ids, tagId) {
  ids.forEach((id) => {
    const p = db.profiles.find((x) => x.id === id);
    if (p && !p.tags.includes(tagId)) {
      p.tags.push(tagId);
      p.updatedAt = now();
    }
  });
  save();
}
function bulkRemoveTag(ids, tagId) {
  ids.forEach((id) => {
    const p = db.profiles.find((x) => x.id === id);
    if (p) p.tags = p.tags.filter((t) => t !== tagId);
  });
  save();
}
function bulkSetFolder(ids, folderId) {
  ids.forEach((id) => updateProfile(id, { folderId }));
}
function bulkSetProxy(ids, proxyRef) {
  ids.forEach((id) => updateProfile(id, proxyRef));
}

// Lixeira: soft-delete, restaurar e exclusao definitiva (apaga userDataDir).
function trashProfiles(ids) {
  ids.forEach((id) => {
    const p = db.profiles.find((x) => x.id === id);
    if (p) {
      p.deletedAt = now();
      p.pinned = false;
    }
  });
  save();
}
function restoreProfiles(ids) {
  ids.forEach((id) => {
    const p = db.profiles.find((x) => x.id === id);
    if (p) p.deletedAt = null;
  });
  save();
}
async function deleteProfilesForever(ids) {
  for (const id of ids) {
    const idx = db.profiles.findIndex((x) => x.id === id);
    if (idx !== -1) db.profiles.splice(idx, 1);
    await fsp.rm(path.join(PROFILES_DIR, id), { recursive: true, force: true }).catch(() => {});
  }
  save();
}

/* ------------------------------ PROXIES ----------------------------- */

function listProxies() {
  return db.proxies.slice();
}
function createProxy(input) {
  const p = normalizeProxy(input);
  if (!p) return null;
  const proxy = {
    id: uid(),
    name: input.name || `${p.host}:${p.port}`,
    ...p,
    addedAt: now(),
    lastIp: null,
    lastCheckedAt: null,
    lastStatus: null,
  };
  db.proxies.push(proxy);
  save();
  return proxy;
}
function updateProxyMeta(id, meta) {
  const p = db.proxies.find((x) => x.id === id);
  if (p) Object.assign(p, meta);
  save();
  return p;
}
function deleteProxy(id) {
  db.proxies = db.proxies.filter((x) => x.id !== id);
  db.profiles.forEach((p) => {
    if (p.proxyId === id) p.proxyId = null;
  });
  save();
}
function importProxiesBulk(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const added = [];
  for (const line of lines) {
    const parsed = parseProxyLine(line);
    if (parsed) {
      const created = createProxy(parsed);
      if (created) added.push(created);
    }
  }
  return added;
}
// Aceita: type://user:pass@host:port | host:port:user:pass | host:port
function parseProxyLine(line) {
  let type = 'http';
  let rest = line;
  const m = line.match(/^(https?|socks[45]):\/\/(.+)$/i);
  if (m) {
    type = m[1].toLowerCase();
    rest = m[2];
  }
  let username = '', password = '', host, port;
  if (rest.includes('@')) {
    const [auth, hp] = rest.split('@');
    [username, password = ''] = auth.split(':');
    [host, port] = hp.split(':');
  } else {
    const parts = rest.split(':');
    if (parts.length === 4) [host, port, username, password] = parts;
    else [host, port] = parts;
  }
  if (!host || !port) return null;
  return { type, host, port, username, password };
}

/* --------------------- FOLDERS / STATUSES / TAGS -------------------- */

function listFolders() { return db.folders.slice(); }
function createFolder(name, color = '#3b82f6') {
  const f = { id: uid(), name, color };
  db.folders.push(f);
  save();
  return f;
}
function updateFolder(id, patch) {
  const f = db.folders.find((x) => x.id === id);
  if (f) Object.assign(f, patch);
  save();
  return f;
}
function deleteFolder(id) {
  db.folders = db.folders.filter((x) => x.id !== id);
  db.profiles.forEach((p) => { if (p.folderId === id) p.folderId = null; });
  save();
}

function listStatuses() { return db.statuses.slice(); }
function createStatus(name, color) {
  const s = { id: uid(), name, color, builtin: false };
  db.statuses.push(s);
  save();
  return s;
}
function deleteStatus(id) {
  const s = db.statuses.find((x) => x.id === id);
  if (s && s.builtin) return false;
  db.statuses = db.statuses.filter((x) => x.id !== id);
  db.profiles.forEach((p) => { if (p.status === id) p.status = 'new'; });
  save();
  return true;
}

function listTags() { return db.tags.slice(); }
function createTag(name, color = '#3b82f6') {
  const t = { id: uid(), name, color };
  db.tags.push(t);
  save();
  return t;
}
function deleteTag(id) {
  db.tags = db.tags.filter((x) => x.id !== id);
  db.profiles.forEach((p) => { p.tags = (p.tags || []).filter((t) => t !== id); });
  save();
}

function getSettings() { return db.settings; }
function saveSettings(patch) { Object.assign(db.settings, patch); save(); }

module.exports = {
  setDataDir, userDataDir,
  listProfiles, getProfile, createProfile, updateProfile, markLaunched, setFingerprintData, setTrustScore, setWarmth, setDetectReport, setWarmReport, setWarmVisited,
  cloneProfile, bulkSetStatus, bulkAddTag, bulkRemoveTag, bulkSetFolder, bulkSetProxy,
  trashProfiles, restoreProfiles, deleteProfilesForever, resolveProxy,
  listProxies, createProxy, updateProxyMeta, deleteProxy, importProxiesBulk,
  listFolders, createFolder, updateFolder, deleteFolder,
  listStatuses, createStatus, deleteStatus,
  listTags, createTag, deleteTag,
  getSettings, saveSettings,
  vaultStatus, isLocked, unlock, lock, setMasterPassword, changeMasterPassword, removeMasterPassword,
};
