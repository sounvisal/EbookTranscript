import { useState, useCallback, useEffect } from 'react'
import type { TelegramSetupState } from '../types'

interface UseTelegramOpsParams {
  showNotification: (msg: string) => void
}

export function useTelegramOps({ showNotification }: UseTelegramOpsParams) {
  const [telegramModalOpen, setTelegramModalOpen] = useState(false)
  const [testingTelegram, setTestingTelegram] = useState(false)
  const [dispatchingDigest, setDispatchingDigest] = useState(false)
  const [telegramSetup, setTelegramSetup] = useState<TelegramSetupState | null>(null)
  const [loadingTelegramSetup, setLoadingTelegramSetup] = useState(false)
  const [registeringWebhook, setRegisteringWebhook] = useState(false)
  const [disconnectingWebhook, setDisconnectingWebhook] = useState(false)

  // Fetch Webhook and Bot Setup Info
  const fetchTelegramSetup = useCallback(async () => {
    setLoadingTelegramSetup(true)
    try {
      const res = await fetch('/api/admin/telegram/setup-webhook')
      if (res.ok) {
        const data = await res.json()
        setTelegramSetup(data)
      }
    } catch (err) {
      console.error('Failed to load webhook setup:', err)
    } finally {
      setLoadingTelegramSetup(false)
    }
  }, [])

  // Test Telegram
  const handleTestTelegram = async () => {
    setTestingTelegram(true)
    try {
      const res = await fetch('/api/admin/telegram/test', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Telegram test alert failed.')
      }
      showNotification('✅ Live test alert delivered to Telegram!')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Telegram test failed.')
    } finally {
      setTestingTelegram(false)
    }
  }

  // Send Evening Digest Now
  const handleDispatchEveningDigest = async () => {
    setDispatchingDigest(true)
    try {
      const res = await fetch('/api/admin/telegram/daily-report', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch daily digest.')
      }
      showNotification('📊 Evening Digest dispatched to Telegram!')
      setTelegramModalOpen(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Digest dispatch failed.')
    } finally {
      setDispatchingDigest(false)
    }
  }

  // Register / Connect 2-Way Interactive Webhook
  const handleRegisterWebhook = async () => {
    setRegisteringWebhook(true)
    try {
      const res = await fetch('/api/admin/telegram/setup-webhook', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to register webhook.')
      }
      showNotification('✅ Telegram 2-way button bot connected & buttons pushed to chat!')
      await fetchTelegramSetup()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Webhook registration failed.')
    } finally {
      setRegisteringWebhook(false)
    }
  }

  // Disconnect Webhook
  const handleDeleteWebhook = async () => {
    if (!confirm('Are you sure you want to disconnect the Telegram webhook? The bot will no longer respond to interactive buttons until reconnected.')) return
    setDisconnectingWebhook(true)
    try {
      const res = await fetch('/api/admin/telegram/setup-webhook', { method: 'DELETE' })
      const data = await res.json()
      if (res.ok && data.success) {
        showNotification('Telegram webhook disconnected.')
        await fetchTelegramSetup()
      } else {
        throw new Error(data.error || 'Failed to disconnect webhook.')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to disconnect webhook.')
    } finally {
      setDisconnectingWebhook(false)
    }
  }

  // Auto-fetch telegram setup when modal opens
  useEffect(() => {
    if (telegramModalOpen) {
      fetchTelegramSetup()
    }
  }, [telegramModalOpen, fetchTelegramSetup])

  return {
    telegramModalOpen,
    setTelegramModalOpen,
    testingTelegram,
    dispatchingDigest,
    telegramSetup,
    loadingTelegramSetup,
    registeringWebhook,
    disconnectingWebhook,
    openTelegramModal: () => setTelegramModalOpen(true),
    closeTelegramModal: () => setTelegramModalOpen(false),
    handleTestTelegram,
    handleDispatchEveningDigest,
    fetchTelegramSetup,
    handleRegisterWebhook,
    handleDeleteWebhook
  }
}
