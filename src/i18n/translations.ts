export const translations = {
  it: {
    placeholder: 'Scrivi un messaggio...',
    online: 'Online',
    typing: 'Sta scrivendo...',
    lastSeen: 'Ultimo accesso',
    lastSeenAt: 'alle',
    yesterday: 'ieri',
    justNow: 'Ultimo accesso pochi minuti fa',
    emptyTitle: 'Inizia la conversazione',
    emptySubtitle: 'Il primo messaggio apparirà qui.',
    addPhoto: 'Aggiungi foto',
    removePhoto: 'Rimuovi foto',
  },
  ru: {
    placeholder: 'Напишите сообщение...',
    online: 'В сети',
    typing: 'Печатает...',
    lastSeen: 'Был(а) в сети',
    lastSeenAt: 'в',
    yesterday: 'вчера',
    justNow: 'Был(а) в сети недавно',
    emptyTitle: 'Начните переписку',
    emptySubtitle: 'Первое сообщение появится здесь.',
    addPhoto: 'Добавить фото',
    removePhoto: 'Удалить фото',
  },
} as const

export type AppLang = keyof typeof translations
