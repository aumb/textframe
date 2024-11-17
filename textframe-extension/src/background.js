'use strict';
import nacl from 'tweetnacl';
import util from 'tweetnacl-util';

let apiUrl = process.env.API_URL;

async function getUUID() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get('uuid', (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else if (result && result.uuid) {
        resolve(result.uuid);
      } else {
        reject(new Error('UUID not found in storage.'));
      }
    });
  });
}

async function getPrivateKey() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get('privateKey', (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else if (result && result.privateKey) {
        resolve(result.privateKey);
      } else {
        reject(new Error('Private key not found in storage.'));
      }
    });
  });
}

async function generateUUID() {
  const storedUUID = await chrome.storage.local.get('uuid');
  if (storedUUID.uuid) {
    return storedUUID.uuid;
  }

  const uuid = crypto.randomUUID();

  await chrome.storage.local.set({ uuid });

  return uuid;
}

async function generateAndRegisterKeys() {
  try {
    const uuid = await generateUUID();
    const keyPair = nacl.sign.keyPair();

    // Encode public key for transmission
    const publicKeyBase64 = util.encodeBase64(keyPair.publicKey);
    const privateKeyBase64 = util.encodeBase64(keyPair.secretKey);

    // Store private key securely
    await chrome.storage.local.set({
      privateKey: privateKeyBase64,
    });

    // Register public key with server
    const response = await fetch(`${apiUrl}/register_public_key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uuid: uuid,
        public_key: publicKeyBase64,
      }),
    });

    if (!response.ok) {
      throw new Error(`Registration failed: ${response.status}`);
    }

    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || 'Registration failed');
    }

    return true;
  } catch (error) {
    console.error('Key registration failed:', error);
    throw error;
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    try {
      await generateAndRegisterKeys();
    } catch (error) {
      console.error('Failed to setup keys:', error);
    }
  } else if (details.reason === 'update') {
    try {
      const uuid = await getUUID();
      const privateKey = await getPrivateKey();

      if (!uuid) {
        await generateUUID();
      } else if (!privateKey) {
        await generateAndRegisterKeys();
      }
    } catch (error) {
      console.error('Failed to setup keys:', error);
    }
  }
});
