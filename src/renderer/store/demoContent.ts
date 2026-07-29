import type { ProseMirrorJSON } from '@shared/types'

/**
 * Pre-seeded content for the demo chapter so the editor shows placeholder text
 * (generic lorem-ipsum filler, not real prose) on first run.
 */
export const DEMO_CHAPTER_1_DOC: ProseMirrorJSON = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.'
        }
      ]
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text:
            'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
        }
      ]
    },
    { type: 'sceneDivider' },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Sed ut perspiciatis unde omnis iste natus error.' }]
    }
  ]
}
