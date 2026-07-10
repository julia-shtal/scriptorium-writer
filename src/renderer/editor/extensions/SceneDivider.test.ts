import { describe, expect, test } from 'vitest'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { SceneDivider } from './SceneDivider'

describe('SceneDivider', () => {
  test('registers an atomic block node named sceneDivider', () => {
    const schema = getSchema([StarterKit, SceneDivider])
    const node = schema.nodes.sceneDivider
    expect(node).toBeDefined()
    expect(node.isBlock).toBe(true)
    expect(node.isAtom).toBe(true)
  })

  test('a sceneDivider node serializes to the expected JSON', () => {
    const schema = getSchema([StarterKit, SceneDivider])
    expect(schema.nodes.sceneDivider.create().toJSON()).toEqual({ type: 'sceneDivider' })
  })
})
