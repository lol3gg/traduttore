import { ProfileProvider, useProfile } from './context/ProfileContext'
import { ProfileSelector } from './components/ProfileSelector'
import { ChatWindow } from './components/ChatWindow'
import { PushPermissionDialog } from './components/PushPermissionDialog'

function SwitchProfileButton() {
  const { setProfile } = useProfile()

  return (
    <button
      type="button"
      onClick={() => setProfile(null)}
      title="Cambia profilo"
      aria-label="Cambia profilo"
      className="safe-top absolute right-3 top-0 z-20 mt-3 rounded-full p-2.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-100 sm:right-4"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    </button>
  )
}

function AppContent() {
  const { profile, loading, savePushSubscription } = useProfile()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-sky-300"
          aria-label="Caricamento"
        />
      </div>
    )
  }

  return (
    <>
      <PushPermissionDialog onSubscribed={(sub) => void savePushSubscription(sub)} />
      {!profile ? (
        <ProfileSelector />
      ) : (
        <div className="relative bg-transparent">
          <SwitchProfileButton />
          <ChatWindow />
        </div>
      )}
    </>
  )
}

function App() {
  return (
    <ProfileProvider>
      <AppContent />
    </ProfileProvider>
  )
}

export default App
