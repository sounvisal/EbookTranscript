const DB_NAME = 'TranscriptMediaDB'
const DB_VERSION = 2
const STORE_NAME = 'media'

type StoredMedia = { id: string; blob: Blob; filename?: string; expiresAt?: number }

function mediaKey(accountId: string, transcriptId: string) {
  return JSON.stringify([accountId, transcriptId])
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('Local media storage is unavailable.'))
      return
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    let blocked = false
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' }).createIndex('expiresAt', 'expiresAt')
        return
      }

      // Old filename aliases cannot be attributed to a transcript or account.
      const store = request.transaction!.objectStore(STORE_NAME)
      store.createIndex('expiresAt', 'expiresAt')
      const rows = store.openCursor()
      rows.onsuccess = () => {
        const cursor = rows.result
        if (!cursor) return
        const item = cursor.value as StoredMedia
        if (item.id === item.filename) cursor.delete()
        cursor.continue()
      }
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      if (blocked) db.close()
      else resolve(db)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      blocked = true
      reject(new Error('Close other tabs to update local audio storage.'))
    }
  })
}

async function withMediaStore<T>(run: (store: IDBObjectStore, finish: (result: T) => void) => void): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      let result: T
      transaction.oncomplete = () => resolve(result)
      transaction.onabort = () => reject(transaction.error || new Error('Local audio storage operation failed.'))
      run(transaction.objectStore(STORE_NAME), (value) => { result = value })
    })
  } finally {
    db.close()
  }
}

export async function saveMediaBlob(accountId: string, transcriptId: string, blob: Blob) {
  await withMediaStore<void>((store, finish) => {
    store.put({ id: mediaKey(accountId, transcriptId), blob } satisfies StoredMedia)
    store.delete(transcriptId)
    finish(undefined)
  })
}

/** Call only after the server has confirmed the transcript belongs to the account. */
export async function getMediaBlob(accountId: string, transcriptId: string, jobId?: string): Promise<Blob | null> {
  try {
    if (jobId) await recoverPendingMedia(accountId, jobId, transcriptId)
    return await withMediaStore<Blob | null>((store, finish) => {
      const key = mediaKey(accountId, transcriptId)
      const saved = store.get(key)
      saved.onsuccess = () => {
        if (saved.result?.blob) {
          finish(saved.result.blob)
          return
        }

        const legacy = store.get(transcriptId)
        legacy.onsuccess = () => {
          const item = legacy.result as StoredMedia | undefined
          if (item?.blob && item.id !== item.filename) {
            store.put({ id: key, blob: item.blob } satisfies StoredMedia)
            store.delete(transcriptId)
            finish(item.blob)
          } else {
            finish(null)
          }
        }
      }
    })
  } catch {
    return null
  }
}

export async function deleteMediaBlob(accountId: string, transcriptId: string, jobId?: string) {
  await withMediaStore<void>((store, finish) => {
    store.delete(mediaKey(accountId, transcriptId))
    store.delete(transcriptId)
    if (jobId) store.delete(mediaKey(accountId, `job:${jobId}`))
    finish(undefined)
  })
}

export async function savePendingMedia(accountId: string, jobId: string, blob: Blob) {
  await withMediaStore<void>((store, finish) => {
    const expired = store.index('expiresAt').openCursor(IDBKeyRange.upperBound(Date.now()))
    expired.onsuccess = () => {
      const cursor = expired.result
      if (!cursor) return
      cursor.delete()
      cursor.continue()
    }
    store.put({
      id: mediaKey(accountId, `job:${jobId}`),
      blob,
      expiresAt: Date.now() + 4 * 60 * 60 * 1000
    } satisfies StoredMedia)
    finish(undefined)
  })
}

export async function recoverPendingMedia(accountId: string, jobId: string, transcriptId: string) {
  await withMediaStore<void>((store, finish) => {
    const pendingKey = mediaKey(accountId, `job:${jobId}`)
    const pending = store.get(pendingKey)
    pending.onsuccess = () => {
      const item = pending.result as StoredMedia | undefined
      if (item?.blob && (item.expiresAt ?? 0) > Date.now()) {
        const targetKey = mediaKey(accountId, transcriptId)
        const existing = store.getKey(targetKey)
        existing.onsuccess = () => {
          if (existing.result === undefined) {
            store.put({ id: targetKey, blob: item.blob } satisfies StoredMedia)
          }
        }
      }
      store.delete(pendingKey)
      finish(undefined)
    }
  })
}
