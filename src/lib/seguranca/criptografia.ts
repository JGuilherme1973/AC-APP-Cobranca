/**
 * Criptografia — AES-256-GCM via Web Crypto API (browser)
 *
 * ATENÇÃO: rotação de chave requer re-criptografia de todos os dados_sensiveis_enc
 *
 * A chave é lida de VITE_ENCRYPTION_KEY (hex string com 32 bytes = 64 caracteres hex).
 * Em AES-GCM o WebCrypto retorna o ciphertext com os 16 bytes do auth tag já concatenados
 * ao final. Portanto separamos: cifrado = bytes[0..n-16], tag = bytes[n-16..n].
 */

import { supabase } from '@/lib/supabase'

export interface CriptografadoResult {
  cifrado: string // base64 (ciphertext sem tag)
  iv: string      // base64, 12 bytes aleatórios
  tag: string     // base64, 16 bytes (auth tag GCM)
}

// ---------------------------------------------------------------------------
// Helpers base64
// ---------------------------------------------------------------------------
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// ---------------------------------------------------------------------------
// Importação de chave a partir de variável de ambiente (hex)
// ---------------------------------------------------------------------------
async function importarChave(): Promise<CryptoKey> {
  const hexKey = import.meta.env.VITE_ENCRYPTION_KEY as string | undefined

  if (!hexKey || hexKey.length !== 64) {
    throw new Error(
      '[Criptografia] VITE_ENCRYPTION_KEY inválida — deve ser uma hex string de 64 caracteres (32 bytes)'
    )
  }

  const keyBytes = new Uint8Array(hexKey.match(/.{2}/g)!.map((b) => parseInt(b, 16)))

  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

// ---------------------------------------------------------------------------
// Criptografar
// ---------------------------------------------------------------------------
export async function criptografar(plaintext: string): Promise<CriptografadoResult> {
  const chave = await importarChave()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoder = new TextEncoder()
  const dados = encoder.encode(plaintext)

  // WebCrypto AES-GCM: retorna ciphertext + 16 bytes de auth tag concatenados
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, dados)

  const encryptedBytes = new Uint8Array(encrypted)
  const tagLength = 16
  const cipherBytes = encryptedBytes.slice(0, encryptedBytes.length - tagLength)
  const tagBytes = encryptedBytes.slice(encryptedBytes.length - tagLength)

  return {
    cifrado: toBase64(cipherBytes),
    iv: toBase64(iv),
    tag: toBase64(tagBytes),
  }
}

// ---------------------------------------------------------------------------
// Descriptografar
// ---------------------------------------------------------------------------
export async function descriptografar(dado: CriptografadoResult): Promise<string> {
  const chave = await importarChave()
  const ivBytes = fromBase64(dado.iv)
  const cipherBytes = fromBase64(dado.cifrado)
  const tagBytes = fromBase64(dado.tag)

  // Usar ArrayBuffer para garantir compatibilidade com SubtleCrypto (evita SharedArrayBuffer)
  const ivBuffer = ivBytes.buffer.slice(ivBytes.byteOffset, ivBytes.byteOffset + ivBytes.byteLength) as ArrayBuffer
  const cipherWithTagBuffer = new ArrayBuffer(cipherBytes.length + tagBytes.length)
  const cipherWithTag = new Uint8Array(cipherWithTagBuffer)
  cipherWithTag.set(cipherBytes, 0)
  cipherWithTag.set(tagBytes, cipherBytes.length)

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuffer }, chave, cipherWithTagBuffer)

  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}

// ---------------------------------------------------------------------------
// Persistência — dados_sensiveis_enc
// ---------------------------------------------------------------------------
export async function salvarDadoSensivel(
  entidade: string,
  entidade_id: string,
  campo: string,
  valor: string
): Promise<void> {
  const resultado = await criptografar(valor)

  // Armazena cifrado e tag juntos como JSON para manter integridade
  const valor_enc = JSON.stringify({ cifrado: resultado.cifrado, tag: resultado.tag })

  const { error } = await supabase.from('dados_sensiveis_enc').upsert(
    {
      entidade,
      entidade_id,
      campo,
      valor_enc,
      iv: resultado.iv,
    },
    { onConflict: 'entidade,entidade_id,campo' }
  )

  if (error) {
    throw new Error(`Erro ao salvar dado sensível (${entidade}/${campo}): ${error.message}`)
  }
}

export async function recuperarDadoSensivel(
  entidade: string,
  entidade_id: string,
  campo: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('dados_sensiveis_enc')
    .select('valor_enc, iv')
    .eq('entidade', entidade)
    .eq('entidade_id', entidade_id)
    .eq('campo', campo)
    .maybeSingle()

  if (error) {
    throw new Error(`Erro ao recuperar dado sensível (${entidade}/${campo}): ${error.message}`)
  }

  if (!data) return null

  let parsed: { cifrado: string; tag: string }
  try {
    parsed = JSON.parse(data.valor_enc) as { cifrado: string; tag: string }
  } catch {
    throw new Error('[Criptografia] valor_enc corrompido — JSON inválido')
  }

  return descriptografar({ cifrado: parsed.cifrado, iv: data.iv, tag: parsed.tag })
}
