import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const SALT_LENGTH = 16
const KEY_LENGTH = 64

export function hashPassword(password: string) {
  const salt = randomBytes(SALT_LENGTH).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex')

  return `${salt}:${hash}`
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(':')

  if (!salt || !hash) {
    return false
  }

  const storedHashBuffer = Buffer.from(hash, 'hex')
  const derivedKeyBuffer = scryptSync(password, salt, storedHashBuffer.length)

  return timingSafeEqual(storedHashBuffer, derivedKeyBuffer)
}
