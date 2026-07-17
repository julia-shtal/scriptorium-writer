import type { ProseMirrorJSON } from '@shared/types'

/** Pre-seeded content for the demo chapter so the editor shows real text on first run. */
export const DEMO_CHAPTER_1_DOC: ProseMirrorJSON = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text:
            'Это ваша рабочая тетрадь. Страница выглядит как тёплый лист книги — пишите здесь длинную прозу, а текст сохранится сам.'
        }
      ]
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text:
            'Эту главу можно свободно переписать или удалить: она лишь пример, чтобы редактор не встречал вас пустой страницей.'
        }
      ]
    },
    { type: 'sceneDivider' },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Доброго письма.' }]
    }
  ]
}
