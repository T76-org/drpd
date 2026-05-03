import { useCallback, useEffect, useMemo, useState } from 'react'

export type PWAInstallOutcome = 'accepted' | 'dismissed'

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: PWAInstallOutcome; platform: string }>
  prompt(): Promise<void>
}

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean
}

const isStandaloneDisplayMode = (): boolean => {
  if (typeof window === 'undefined') {
    return false
  }

  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as NavigatorWithStandalone).standalone === true
  )
}

export const usePWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(isStandaloneDisplayMode)

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      if (isStandaloneDisplayMode()) {
        return
      }

      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
      setIsInstalled(false)
    }

    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setIsInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<PWAInstallOutcome | null> => {
    if (!deferredPrompt || isInstalled) {
      return null
    }

    const promptEvent = deferredPrompt
    setDeferredPrompt(null)
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    return choice.outcome
  }, [deferredPrompt, isInstalled])

  return useMemo(
    () => ({
      canInstall: deferredPrompt !== null && !isInstalled,
      isInstalled,
      promptInstall,
    }),
    [deferredPrompt, isInstalled, promptInstall],
  )
}
