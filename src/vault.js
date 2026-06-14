'use strict';

// Vault — criptografia em repouso do store (cookies, credenciais de proxy, fingerprints).
// KDF: scrypt (memory-hard, embutido no Node — sem dependência nativa).
// Cifra: AES-256-GCM (autenticada — detecta senha errada/adulteração).

const crypto = require('crypto');

const PARAMS = { N: 32768, r: 8, p: 1, keylen: 32, maxmem: 96 * 1024 * 1024 };

function deriveKey(password, salt, params = PARAMS) {
  return crypto.scryptSync(password, salt, params.keylen, {
    N: params.N, r: params.r, p: params.p, maxmem: params.maxmem,
  });
}

// Cifra um objeto JS com uma chave já derivada (+ salt/params para o cabeçalho do arquivo).
function encrypt(obj, key, salt, params = PARAMS) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1, kdf: 'scrypt',
    N: params.N, r: params.r, p: params.p, keylen: params.keylen,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: data.toString('base64'),
  };
}

// Decifra o arquivo do vault com a chave derivada. Lança se a senha estiver errada (GCM).
function decrypt(file, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(file.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(file.tag, 'base64'));
  const out = Buffer.concat([decipher.update(Buffer.from(file.data, 'base64')), decipher.final()]);
  return JSON.parse(out.toString('utf8'));
}

function paramsFromFile(file) {
  return { N: file.N, r: file.r, p: file.p, keylen: file.keylen || 32, maxmem: PARAMS.maxmem };
}

module.exports = { deriveKey, encrypt, decrypt, paramsFromFile, PARAMS };
