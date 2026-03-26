// apps/web/src/platform/storage/utils/crypto.ts

import { StorageEncryptionError } from '../errors';

export async function generateKey(secret: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(secret));

    return crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
    ]);
}

export async function encrypt(data: string, key: CryptoKey): Promise<string> {
    try {
        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoder.encode(data),
        );

        // 合并 IV 和密文
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encrypted), iv.length);

        return btoa(String.fromCharCode(...combined));
    } catch (_error) {
        throw new StorageEncryptionError('加密失败');
    }
}

export async function decrypt(encryptedData: string, key: CryptoKey): Promise<string> {
    try {
        const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);

        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch (_error) {
        throw new StorageEncryptionError('解密失败');
    }
}
