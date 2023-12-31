import { Md5 } from 'ts-md5'

/**
 * Convert hex string to Uint8Array
 * @param hexString
 * @returns
 */
export function fromHexString(hexString: string) {
  hexString = hexString.startsWith('0x') ? hexString.slice(2) : hexString
  hexString = hexString.length % 2 ? `0${hexString}` : hexString
  return Uint8Array.from(Buffer.from(hexString, 'hex'))
}

/**
 * Convert Uint8Array to hex string
 * @param uint8array
 * @returns
 */
export function toHexString(uint8array: Uint8Array) {
  return Buffer.from(uint8array).toString('hex')
}

/**
 * Generate a random key
 * @param length
 * @returns
 */
export const randomUniqueKey = (length = 6) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz1234567890'
  const maxPos = chars.length
  let key = ''
  for (let i = 0; i < length; i++)
    key += chars.charAt(Math.floor(Math.random() * maxPos))

  return key
}

export function convertToMd5(value: Uint8Array): string {
  const md5 = new Md5()
  md5.appendByteArray(value)
  const hash = md5.end()
  if (!hash)
    return ''
  return hash.toString()
}
