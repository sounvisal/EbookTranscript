/**
 * Browser-native Persistent Media Storage using IndexedDB.
 * Allows uploaded audio and video recordings to be saved locally on the user's device,
 * enabling full native audio playback from History without server hosting costs or quota limits.
 */

const DB_NAME = 'TranscriptMediaDB'
const DB_VERSION = 1
const STORE_NAME = 'media'

type StoredMediaItem = {
  id: string
  filename?: string
  blob: Blob
  mimeType: string
  updatedAt: number
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('filename', 'filename', { unique: false })
          store.createIndex('updatedAt', 'updatedAt', { unique: false })
        }
      }

      request.onsuccess = () => {
        resolve(request.result)
      }

      request.onerror = () => {
        console.warn('IndexedDB open error:', request.error)
        resolve(null)
      }
    } catch (err) {
      console.warn('IndexedDB initialization failed:', err)
      resolve(null)
    }
  })
}

/**
 * Persist an audio/video blob or file in IndexedDB under primary ID and optional filename.
 */
export async function saveMediaBlob(
  id: string,
  blobOrFile: Blob | File,
  filename?: string
): Promise<void> {
  const db = await openDatabase()
  if (!db) return

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      const item: StoredMediaItem = {
        id,
        filename: filename || (blobOrFile instanceof File ? blobOrFile.name : undefined),
        blob: blobOrFile,
        mimeType: blobOrFile.type || 'audio/wav',
        updatedAt: Date.now()
      }

      const request = store.put(item)
      request.onsuccess = () => resolve()
      request.onerror = () => {
        console.warn('Failed to store media in IndexedDB:', request.error)
        resolve()
      }

      // If filename is provided and differs from id, also index under filename
      if (filename && filename !== id) {
        const altItem: StoredMediaItem = {
          ...item,
          id: filename
        }
        store.put(altItem)
      }
    } catch (err) {
      console.warn('saveMediaBlob error:', err)
      resolve()
    }
  })
}

/**
 * Retrieve a stored audio/video Blob by transcript ID or filename.
 */
export async function getMediaBlob(
  id?: string | null,
  filename?: string | null
): Promise<Blob | null> {
  const db = await openDatabase()
  if (!db) return null

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)

      // 1. Try direct lookup by id
      if (id) {
        const req = store.get(id)
        req.onsuccess = () => {
          if (req.result?.blob) {
            return resolve(req.result.blob)
          }
          // If not found by id, try filename
          lookupByFilename()
        }
        req.onerror = () => lookupByFilename()
      } else {
        lookupByFilename()
      }

      function lookupByFilename() {
        if (!filename) return resolve(null)

        // Try direct get by filename
        const directReq = store.get(filename)
        directReq.onsuccess = () => {
          if (directReq.result?.blob) {
            return resolve(directReq.result.blob)
          }

          // Try index search
          try {
            const index = store.index('filename')
            const indexReq = index.get(filename)
            indexReq.onsuccess = () => {
              resolve(indexReq.result?.blob || null)
            }
            indexReq.onerror = () => resolve(null)
          } catch {
            resolve(null)
          }
        }
        directReq.onerror = () => resolve(null)
      }
    } catch (err) {
      console.warn('getMediaBlob error:', err)
      resolve(null)
    }
  })
}

/**
 * Delete a media item from IndexedDB by ID or filename.
 */
export async function deleteMediaBlob(id: string): Promise<void> {
  const db = await openDatabase()
  if (!db) return

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}
