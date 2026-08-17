import { ProfileProvider, useProfile } from './context/ProfileContext'
import { ThemeProvider } from './context/ThemeContext'
import { ProfileSelector } from './components/ProfileSelector'
import { ChatWindow } from './components/ChatWindow'
import { PushPermissionDialog } from './components/PushPermissionDialog'

function AppContent() {
  const { profile, loading, savePushSubscription } = useProfile()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--line)] border-t-sky-400"
          aria-label="Caricamento"
        />
      </div>
    )
  }

  return (
    <>
      {!profile ? (
        <ProfileSelector />
      ) : (
        <>
          <PushPermissionDialog
            lang={profile.lang}
            onSubscribed={(sub) => void savePushSubscription(sub)}
          />
          <ChatWindow />
        </>
      )}
    </>
  )
}

function App() {
  return (
    <ThemeProvider>
      <ProfileProvider>
        <AppContent />
      </ProfileProvider>
    </ThemeProvider>
  )
}

export default App
