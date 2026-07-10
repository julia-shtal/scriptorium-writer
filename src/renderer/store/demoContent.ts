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
            'Его первым чувством стало унижение, вторым — отчаяние. Франц стоял на коленях перед молодой церкви, да ещё и в лоне храма, где от такого порока ограждали.'
        }
      ]
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text:
            'Он дышал после долгого неразборчивого молчания и не смотрел ей в глаза — только в тот момент, дабы не прослыть эгоистичным гордецом.'
        }
      ]
    },
    { type: 'sceneDivider' },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text:
            'Наутро всё казалось иным. Свет ложился на каменный пол ровными полосами, и в этой тишине было что-то почти прощающее.'
        }
      ]
    }
  ]
}
