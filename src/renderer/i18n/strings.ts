/**
 * Hand-rolled RU/EN string dictionary for all app chrome + renderer-surfaced
 * system messages (M26). Author content is never in here.
 *
 * `en` is typed `: Dictionary` (= `typeof ru`) so the compiler forces `en` to
 * carry every key `ru` has — the completeness guarantee an i18n library would
 * otherwise provide. `ru` is the shape authority; mirror it key-for-key in `en`.
 *
 * Only the `nav` section exists so far; later M26 tasks add the rest.
 */

export const ru = {
  nav: {
    // Sidebar section headers (Sidebar.tsx)
    sectionWork: 'РАБОТА',
    sectionGeneral: 'ОБЩЕЕ',
    // WORK nav items (Sidebar.tsx)
    editor: 'Редактор',
    chapters: 'Главы',
    story: 'О работе',
    versions: 'История версий',
    notes: 'Заметки',
    search: 'Поиск',
    statistics: 'Статистика',
    // GENERAL nav items (Sidebar.tsx)
    library: 'Библиотека',
    settings: 'Настройки',
    // Sidebar chrome (Sidebar.tsx)
    bookTitle: 'Моя книга',
    collapseSidebar: 'Свернуть меню',
    expandSidebar: 'Показать меню',
    // Frame chrome (AppFrame.tsx)
    exitFocus: 'Выйти из фокуса'
  },
  // Story-status labels (Library + Story-info views), keyed by StoryStatus.
  status: { draft: 'черновик', in_progress: 'в работе', done: 'готово' },
  // Plural noun forms for count+noun phrases. Callers compose `${count} ${plural(...)}`
  // via `plural()` (src/renderer/i18n/plural.ts). RU uses one/few/many; EN sets few=many.
  plurals: {
    words: { one: 'слово', few: 'слова', many: 'слов' },
    chapters: { one: 'глава', few: 'главы', many: 'глав' },
    fixes: { one: 'исправление', few: 'исправления', many: 'исправлений' }
  },
  // Settings view (SettingsView.tsx)
  settings: {
    title: 'Настройки',
    loading: 'Загрузка настроек…',
    language: 'Язык интерфейса',
    languageRu: 'Русский',
    languageEn: 'English',
    autosaveSec: 'Автосохранение, сек',
    spellLanguages: 'Языки проверки',
    webSpellcheckNote:
      'На планшете проверка орфографии выполняется системой устройства — набор языков зависит от клавиатуры и настроек Android, а не от приложения.',
    font: 'Шрифт',
    fontSizePx: 'Размер шрифта, px',
    minimalFooter: 'Минимальная нижняя панель',
    versionsPerChapter: 'Версий на главу',
    libraryFolder: 'Папка библиотеки',
    reveal: 'показать',
    exportLibrary: 'Экспортировать библиотеку',
    exporting: 'Экспорт…',
    librarySaved: 'Библиотека сохранена:',
    storageHeading: 'Хранилище',
    storagePersisted: 'Данные хранятся постоянно на этом устройстве.',
    storageNotPersisted:
      'Браузер может удалить данные приложения при нехватке места. Регулярно сохраняйте резервную копию библиотеки.',
    storageUsage: 'Занято {used} из {total}'
  },
  // Library view (LibraryView.tsx)
  library: {
    title: 'Библиотека',
    createPlaceholder: 'Название новой работы',
    createButton: 'создать',
    // Chapter/word counts on each card. `{chapters}`/`{words}` are already-composed
    // pluralized phrases (e.g. "12 глав", "3400 слов"); this is just the separator.
    meta: '{chapters} · {words}',
    empty: 'Пока нет работ. Создайте первую.',
    deleteConfirmTitle: 'Удалить работу?',
    deleteConfirmMessage: '«{title}» будет перемещена в корзину.'
  },
  // Chapters view (ChaptersView.tsx)
  chapters: {
    noStory: 'Нет открытой работы.',
    // Header with chapter count. `{count}` is a number (heading, not a count+noun phrase).
    heading: 'Главы · {count}',
    addChapter: 'глава',
    import: 'Импортировать…',
    open: 'открыть',
    exportChapter: 'Экспортировать главу',
    untitled: 'Без названия',
    deleteConfirmTitle: 'Удалить главу?',
    deleteConfirmMessage: '«{title}» будет перемещена в корзину.'
  },
  // Editor toolbar button tooltips (Toolbar.tsx). Mostly `title=` attributes.
  toolbar: {
    italic: 'Курсив',
    bold: 'Полужирный',
    strike: 'Зачёркнутый',
    alignLeft: 'По левому краю',
    alignCenter: 'По центру',
    alignRight: 'По правому краю',
    undo: 'Отменить',
    redo: 'Повторить',
    redLine: 'Красная строка',
    footnote: 'Сноска',
    sceneDivider: 'Разделитель сцен',
    cleanup: 'Чистка текста: слипшиеся запятые, лишние пробелы, короткое тире → длинное',
    cleanupEmpty: 'Нечего чистить',
    findReplace: 'Найти и заменить (Ctrl+F)'
  },
  // Editor surface chrome: empty-state, chapter-head controls (EditorView.tsx),
  // footer save/word status (EditorFooter.tsx), and cleanup-wand action bar
  // (WandActionBar.tsx). Author content (chapter body/title) is never here.
  editor: {
    // Empty state shown when no work is open (EditorView.tsx).
    emptyTitle: 'Нет открытой работы.',
    // `{before}`/`{link}`/`{after}` wrap the inline "Библиотеке" link button.
    emptyBefore: 'Создайте новую работу в ',
    emptyLink: 'Библиотеке',
    emptyAfter: ', затем начните писать.',
    // Chapter-head icon tooltips (EditorView.tsx).
    versionHistory: 'История версий',
    focusMode: 'Режим фокуса',
    minimalFooter: 'Минимальная нижняя панель',
    export: 'Экспорт',
    // Footer save-status (EditorFooter.tsx).
    saving: 'сохранение…',
    saveError: 'ошибка сохранения',
    // `{time}` is the locale-formatted save time.
    savedAt: 'сохранено {time}',
    unsaved: 'не сохранено',
    editing: 'редактирование…',
    retry: 'повторить',
    mdWarning: '⚠ копия .md не сохранена',
    // Selection word-count suffix. `{phrase}` is an already-composed pluralized
    // phrase (e.g. "3 слова"); the total word count is rendered directly, no template.
    selected: ' · выделено {phrase}',
    save: 'Сохранить',
    // Cleanup-wand action bar (WandActionBar.tsx). `{label}` is the pluralized
    // fix-count phrase composed via plural(count, plurals.fixes, language).
    wandPreview: 'Предпросмотр чистки текста',
    wandFound: 'Найдено {label}',
    wandCancel: 'Отмена',
    wandCancelTitle: 'Отмена (Esc)',
    wandApply: 'Применить',
    wandApplyTitle: 'Применить (Enter)',
    // Footnote node-view chrome (FootnoteView.tsx). The footnote's actual text,
    // typed by the author, is content and never routed here.
    footnotePlaceholder: 'Текст сноски…',
    footnoteClose: 'Закрыть',
    footnoteEmpty: '(пустая сноска)'
  },
  // Find & Replace bar (FindReplaceBar.tsx). Chrome only — the user's search
  // query/replacement text is author input and is never routed through here.
  findReplace: {
    dialogLabel: 'Найти и заменить',
    findPlaceholder: 'Найти',
    replacePlaceholder: 'Заменить на',
    caseSensitive: 'Учитывать регистр',
    caseSensitiveLabel: 'Аа',
    wholeWord: 'Слово целиком',
    wholeWordLabel: '|Слово|',
    prev: 'Предыдущее (Shift+Enter / Shift+F3)',
    next: 'Следующее (Enter / F3)',
    replace: 'Заменить',
    replaceAll: 'Заменить всё (Ctrl+Alt+Enter)',
    replaceAllButton: 'Заменить всё',
    close: 'Закрыть (Esc)',
    noMatches: 'Нет совпадений',
    // `{count}` is a number (a "Replaced: N" status, not a count+noun phrase).
    replacedN: 'Заменено: {count}',
    // Match-position indicator. `{current}`/`{total}` are numbers.
    position: '{current} / {total}'
  },
  // Story-info view (StoryInfoView.tsx). Chrome only — the story title,
  // description, and tags the author types are content and never routed here.
  storyInfo: {
    noStory: 'Нет открытой работы.',
    heading: 'О работе',
    titleLabel: 'Название',
    descriptionLabel: 'Описание',
    tagsLabel: 'Теги',
    statusLabel: 'Статус'
  },
  // Notes view (NotesView.tsx). Chrome only — each entry's name/body and the
  // scratch text are author content and never routed here. The section keys
  // (characters/locations/world/timeline/scratch) map to the fixed Notes
  // categories in the data model, not to author-entered text.
  notes: {
    noStory: 'Нет открытой работы.',
    loading: 'Загрузка заметок…',
    characters: 'Персонажи',
    locations: 'Локации',
    world: 'Мир',
    timeline: 'Хронология',
    scratch: 'Черновик',
    add: 'добавить',
    namePlaceholder: 'Имя',
    bodyPlaceholder: 'Заметка'
  },
  // Statistics view (StatisticsView.tsx). Chrome only — chapter titles rendered
  // in the per-chapter list are author content and never routed here.
  statistics: {
    heading: 'Статистика',
    totalWords: 'всего слов',
    chaptersCount: 'глав',
    streakDays: 'дней подряд',
    byChapter: 'По главам'
  },
  // Version history view (VersionHistoryView.tsx). Chrome only — snapshot content
  // and the localized timestamps (via formatDateTime) are data, not routed here.
  versions: {
    noChapter: 'Нет открытой главы.',
    // Heading with snapshot count. `{count}` is a number (heading, not a count+noun phrase).
    heading: 'История версий · {count}',
    toEditor: 'к редактору',
    restore: 'восстановить',
    empty: 'Снимков пока нет.',
    selectPrompt: 'Выберите снимок слева для просмотра.'
  },
  // Search view (SearchView.tsx, M16 full-text search). Chrome only — the search
  // query and matched snippet text from author chapters are content, never here.
  search: {
    noStory: 'Нет открытой работы.',
    placeholder: 'Искать в работе…',
    find: 'Найти',
    searching: 'Поиск…',
    partialRead: 'Не удалось прочитать часть работы',
    // Failed-chapter suffix. `{count}` is a number (kept as "(chapters: N)" by design).
    partialReadChapters: ' (глав: {count})',
    empty: 'Ничего не найдено.'
  },
  // Export popover (ExportMenu.tsx). Chrome only — menu item labels, captions, and
  // the trigger accessible label. Formats (.docx/.md) are literal file extensions.
  exportMenu: {
    trigger: 'Экспорт',
    captionChapter: 'Экспорт главы',
    captionStory: 'Экспорт работы',
    chapterDocx: 'Глава → .docx',
    chapterMd: 'Глава → .md',
    storyDocx: 'Работа → .docx',
    storyMd: 'Работа → .md',
    compactDocx: '.docx',
    compactMd: '.md'
  },
  // Import preview/confirm dialog (ImportDialog.tsx). Chrome only — the imported
  // chapter titles rendered in the preview list are author content, not routed here.
  importDialog: {
    title: 'Импорт',
    modeSingle: 'Одним файлом → одна глава',
    modeSplit: 'Разбить по заголовкам на отдельные главы',
    // `{count}` is a number; `{chapters}` is the pluralized chapter noun.
    previewCount: 'Будет создано {count} {chapters}:',
    untitled: 'Без названия',
    splitWarning:
      'Импорт применяется по одной главе, поэтому если он прервётся на середине, уже созданные главы останутся.',
    lossyNotice: 'Часть форматирования могла не сохраниться при импорте.',
    cancel: 'Отмена',
    committing: 'Импорт…',
    commit: 'Импортировать'
  },
  // Startup crash-recovery prompt (RecoveryDialog.tsx). Chrome only — chapter titles
  // are author content and fall back to chapterId, not routed here.
  recoveryDialog: {
    title: 'Восстановление',
    intro: 'Некоторые главы не удалось прочитать. Можно восстановить их из последнего снимка.',
    reasonMissing: 'файл отсутствует',
    reasonCorrupt: 'файл повреждён',
    restoreFailed: ' не удалось восстановить',
    restore: 'восстановить',
    noSnapshot: 'нет снимка',
    close: 'закрыть'
  },
  // Generic destructive-action confirm modal (ConfirmDialog.tsx). Defaults only —
  // callers pass their own title/message; these back the default button labels.
  confirmDialog: {
    confirm: 'Удалить',
    cancel: 'Отмена'
  },
  // Update-ready notice (UpdateNotice.tsx). `{version}` is the downloaded version.
  updateNotice: {
    ready: 'Обновление загружено (версия {version}). Перезапустите, чтобы установить.',
    restart: 'Перезапустить',
    later: 'Позже'
  },
  // Web/PWA service-worker update prompt (WebUpdateNotice.tsx). No version number: the
  // browser only signals that a newer build is waiting.
  webUpdate: {
    ready: 'Доступна новая версия',
    update: 'Обновить',
    later: 'Позже'
  },
  // Backup nudge shown in the library view on web when a backup is overdue (MP9).
  backup: {
    nudgeText: 'Давно не было резервной копии. Библиотека в браузере может быть удалена — сохраните копию.',
    nudgeAction: 'Сохранить резервную копию',
    dismiss: 'Позже'
  },
  // Renderer-surfaced error messages (extended by later M26 tasks).
  errors: {
    exportLibraryFailedDisk:
      'Не удалось сохранить архив библиотеки. Проверьте место на диске и права доступа.',
    exportLibraryFailed: 'Не удалось экспортировать библиотеку.',
    // ImportDialog commit failure (whole-file import could not complete).
    importFailed:
      'Не удалось импортировать файл целиком. Возможно, он повреждён или в неподдерживаемом формате; часть глав могла быть создана.',
    // useExport per-format failures. `{ext}` is the target file extension (.docx/.md).
    exportChapterFailed: 'Не удалось экспортировать главу в {ext}.',
    exportStoryFailed: 'Не удалось экспортировать работу в {ext}.',
    // app.tsx top-level boot / recovery fallbacks + fatal chrome.
    openLibraryFailed: 'Не удалось открыть библиотеку',
    openRecoveredChapterFailed: 'Не удалось открыть восстановлённую главу',
    // `{message}` is the surfaced AppError/Error message.
    fatalPrefix: 'Ошибка: {message}',
    booting: 'Загрузка…'
  }
} as const

/**
 * `ru` uses `as const`, so `typeof ru` pins every leaf to its exact string
 * literal. `en` must satisfy the *shape*, not those specific Russian literals,
 * so we deep-widen every leaf back to `string` while keeping the key structure.
 */
type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>
}

export type Dictionary = DeepStringify<typeof ru>

export const en: Dictionary = {
  nav: {
    sectionWork: 'WORK',
    sectionGeneral: 'GENERAL',
    editor: 'Editor',
    chapters: 'Chapters',
    story: 'About the work',
    versions: 'Version history',
    notes: 'Notes',
    search: 'Search',
    statistics: 'Statistics',
    library: 'Library',
    settings: 'Settings',
    bookTitle: 'My book',
    collapseSidebar: 'Collapse menu',
    expandSidebar: 'Show menu',
    exitFocus: 'Exit focus'
  },
  status: { draft: 'draft', in_progress: 'in progress', done: 'done' },
  plurals: {
    words: { one: 'word', few: 'words', many: 'words' },
    chapters: { one: 'chapter', few: 'chapters', many: 'chapters' },
    fixes: { one: 'fix', few: 'fixes', many: 'fixes' }
  },
  settings: {
    title: 'Settings',
    loading: 'Loading settings…',
    language: 'Interface language',
    languageRu: 'Русский',
    languageEn: 'English',
    autosaveSec: 'Autosave, sec',
    spellLanguages: 'Spellcheck languages',
    webSpellcheckNote:
      "On tablets, spellcheck is handled by the device's own system — the available languages depend on your keyboard and Android settings, not on the app.",
    font: 'Font',
    fontSizePx: 'Font size, px',
    minimalFooter: 'Minimal footer',
    versionsPerChapter: 'Versions per chapter',
    libraryFolder: 'Library folder',
    reveal: 'reveal',
    exportLibrary: 'Export library',
    exporting: 'Exporting…',
    librarySaved: 'Library saved:',
    storageHeading: 'Storage',
    storagePersisted: 'Your data is stored persistently on this device.',
    storageNotPersisted:
      'The browser may remove app data when storage is low. Back up your library regularly.',
    storageUsage: '{used} of {total} used'
  },
  library: {
    title: 'Library',
    createPlaceholder: 'Title of the new work',
    createButton: 'create',
    meta: '{chapters} · {words}',
    empty: 'No works yet. Create your first one.',
    deleteConfirmTitle: 'Delete work?',
    deleteConfirmMessage: '“{title}” will be moved to the trash.'
  },
  chapters: {
    noStory: 'No open work.',
    heading: 'Chapters · {count}',
    addChapter: 'chapter',
    import: 'Import…',
    open: 'open',
    exportChapter: 'Export chapter',
    untitled: 'Untitled',
    deleteConfirmTitle: 'Delete chapter?',
    deleteConfirmMessage: '“{title}” will be moved to the trash.'
  },
  toolbar: {
    italic: 'Italic',
    bold: 'Bold',
    strike: 'Strikethrough',
    alignLeft: 'Align left',
    alignCenter: 'Align center',
    alignRight: 'Align right',
    undo: 'Undo',
    redo: 'Redo',
    redLine: 'First-line indent',
    footnote: 'Footnote',
    sceneDivider: 'Scene divider',
    cleanup: 'Clean up text: run-together commas, extra spaces, hyphen → em dash',
    cleanupEmpty: 'Nothing to clean',
    findReplace: 'Find and replace (Ctrl+F)'
  },
  editor: {
    emptyTitle: 'No open work.',
    emptyBefore: 'Create a new work in the ',
    emptyLink: 'Library',
    emptyAfter: ', then start writing.',
    versionHistory: 'Version history',
    focusMode: 'Focus mode',
    minimalFooter: 'Minimal footer',
    export: 'Export',
    saving: 'saving…',
    saveError: 'save error',
    savedAt: 'saved {time}',
    unsaved: 'not saved',
    editing: 'editing…',
    retry: 'retry',
    mdWarning: '⚠ .md copy not saved',
    selected: ' · selected {phrase}',
    save: 'Save',
    wandPreview: 'Text cleanup preview',
    wandFound: 'Found {label}',
    wandCancel: 'Cancel',
    wandCancelTitle: 'Cancel (Esc)',
    wandApply: 'Apply',
    wandApplyTitle: 'Apply (Enter)',
    footnotePlaceholder: 'Footnote text…',
    footnoteClose: 'Close',
    footnoteEmpty: '(empty footnote)'
  },
  findReplace: {
    dialogLabel: 'Find and replace',
    findPlaceholder: 'Find',
    replacePlaceholder: 'Replace with',
    caseSensitive: 'Match case',
    caseSensitiveLabel: 'Aa',
    wholeWord: 'Whole word',
    wholeWordLabel: '|Word|',
    prev: 'Previous (Shift+Enter / Shift+F3)',
    next: 'Next (Enter / F3)',
    replace: 'Replace',
    replaceAll: 'Replace all (Ctrl+Alt+Enter)',
    replaceAllButton: 'Replace all',
    close: 'Close (Esc)',
    noMatches: 'No matches',
    replacedN: 'Replaced: {count}',
    position: '{current} of {total}'
  },
  storyInfo: {
    noStory: 'No open work.',
    heading: 'About the work',
    titleLabel: 'Title',
    descriptionLabel: 'Description',
    tagsLabel: 'Tags',
    statusLabel: 'Status'
  },
  notes: {
    noStory: 'No open work.',
    loading: 'Loading notes…',
    characters: 'Characters',
    locations: 'Locations',
    world: 'World',
    timeline: 'Timeline',
    scratch: 'Scratch',
    add: 'add',
    namePlaceholder: 'Name',
    bodyPlaceholder: 'Note'
  },
  statistics: {
    heading: 'Statistics',
    totalWords: 'words total',
    chaptersCount: 'chapters',
    streakDays: 'days in a row',
    byChapter: 'By chapter'
  },
  versions: {
    noChapter: 'No open chapter.',
    heading: 'Version history · {count}',
    toEditor: 'to editor',
    restore: 'restore',
    empty: 'No snapshots yet.',
    selectPrompt: 'Select a snapshot on the left to preview.'
  },
  search: {
    noStory: 'No open work.',
    placeholder: 'Search the work…',
    find: 'Find',
    searching: 'Searching…',
    partialRead: 'Could not read part of the work',
    partialReadChapters: ' (chapters: {count})',
    empty: 'Nothing found.'
  },
  exportMenu: {
    trigger: 'Export',
    captionChapter: 'Export chapter',
    captionStory: 'Export work',
    chapterDocx: 'Chapter → .docx',
    chapterMd: 'Chapter → .md',
    storyDocx: 'Work → .docx',
    storyMd: 'Work → .md',
    compactDocx: '.docx',
    compactMd: '.md'
  },
  importDialog: {
    title: 'Import',
    modeSingle: 'One file → one chapter',
    modeSplit: 'Split by headings into separate chapters',
    previewCount: '{count} {chapters} will be created:',
    untitled: 'Untitled',
    splitWarning:
      'Import is applied one chapter at a time, so if it is interrupted midway, the chapters already created will remain.',
    lossyNotice: 'Some formatting may not have been preserved during import.',
    cancel: 'Cancel',
    committing: 'Importing…',
    commit: 'Import'
  },
  recoveryDialog: {
    title: 'Recovery',
    intro: 'Some chapters could not be read. You can restore them from the latest snapshot.',
    reasonMissing: 'file is missing',
    reasonCorrupt: 'file is corrupted',
    restoreFailed: ' could not restore',
    restore: 'restore',
    noSnapshot: 'no snapshot',
    close: 'close'
  },
  confirmDialog: {
    confirm: 'Delete',
    cancel: 'Cancel'
  },
  updateNotice: {
    ready: 'Update downloaded (version {version}). Restart to install.',
    restart: 'Restart',
    later: 'Later'
  },
  webUpdate: {
    ready: 'A new version is available',
    update: 'Update',
    later: 'Later'
  },
  // Backup nudge shown in the library view on web when a backup is overdue (MP9).
  backup: {
    nudgeText: 'No recent backup. Your in-browser library can be cleared — save a copy.',
    nudgeAction: 'Save a backup',
    dismiss: 'Later'
  },
  errors: {
    exportLibraryFailedDisk:
      'Could not save the library archive. Check available disk space and permissions.',
    exportLibraryFailed: 'Could not export the library.',
    importFailed:
      'Could not import the whole file. It may be corrupted or in an unsupported format; some chapters may have been created.',
    exportChapterFailed: 'Could not export the chapter to {ext}.',
    exportStoryFailed: 'Could not export the work to {ext}.',
    openLibraryFailed: 'Could not open the library',
    openRecoveredChapterFailed: 'Could not open the recovered chapter',
    fatalPrefix: 'Error: {message}',
    booting: 'Loading…'
  }
}

/**
 * Minimal `{token}` interpolation. No plural rules, no ICU: pluralization is
 * handled separately by `plural()` (src/renderer/i18n/plural.ts), whose composed
 * phrases are passed in here as ordinary tokens.
 */
export function format(str: string, params: Record<string, string>): string {
  return str.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? params[key] : match
  )
}
