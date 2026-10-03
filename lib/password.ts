import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const SALT_LENGTH = 16
const KEY_LENGTH = 64

export function hashPassword(password: string) {
  const salt = randomBytes(SALT_LENGTH).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex')

  return `${salt}:${hash}`
}

export function verifyPassword(password: string, storedHash: string) {
  try {
    const [salt, hash] = storedHash.split(':')

    if (!salt || !hash || hash.length !== KEY_LENGTH * 2) {
      return false
    }

    const storedHashBuffer = Buffer.from(hash, 'hex')
    if (storedHashBuffer.length !== KEY_LENGTH) {
      return false
    }

    const derivedKeyBuffer = scryptSync(password, salt, KEY_LENGTH)
    return timingSafeEqual(storedHashBuffer, derivedKeyBuffer)
  } catch {
    return false
  }
}
