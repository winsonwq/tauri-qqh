import {
  $applyNodeReplacement,
  DecoratorNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import { ReactNode } from 'react'

export interface TagPayload {
  id: string
  type: 'mention' | 'hashtag' | 'custom'
  label: string
  value: string
  triggerChar?: string
}

export type SerializedTagNode = Spread<
  {
    id: string
    type: 'mention' | 'hashtag' | 'custom'
    label: string
    value: string
    triggerChar?: string
  },
  SerializedLexicalNode
>

export class TagNode extends DecoratorNode<ReactNode> {
  __id: string
  __type: 'mention' | 'hashtag' | 'custom'
  __label: string
  __value: string
  __triggerChar?: string

  static getType(): string {
    return 'tag'
  }

  static clone(node: TagNode): TagNode {
    return new TagNode(
      {
        id: node.__id,
        type: node.__type,
        label: node.__label,
        value: node.__value,
        triggerChar: node.__triggerChar,
      },
      node.__key,
    )
  }

  constructor(payload: TagPayload, key?: NodeKey) {
    super(key)
    this.__id = payload.id
    this.__type = payload.type
    this.__label = payload.label
    this.__value = payload.value
    this.__triggerChar = payload.triggerChar
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'tag-node'
    return span
  }

  updateDOM(): false {
    return false
  }

  decorate(): ReactNode {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/20 text-primary text-sm font-medium"
        contentEditable={false}
        data-tag-id={this.__id}
        data-tag-type={this.__type}
        data-tag-value={this.__value}
      >
        {this.__triggerChar && <span>{this.__triggerChar}</span>}
        <span>{this.__label}</span>
      </span>
    )
  }

  static importJSON(serializedNode: SerializedTagNode): TagNode {
    const { id, type, label, value, triggerChar } = serializedNode
    return $createTagNode({
      id,
      type,
      label,
      value,
      triggerChar,
    })
  }

  exportJSON(): SerializedTagNode {
    return {
      id: this.__id,
      type: this.__type,
      label: this.__label,
      value: this.__value,
      triggerChar: this.__triggerChar,
      version: 1,
    }
  }

  getTextContent(): string {
    return `${this.__triggerChar || ''}${this.__label}`
  }

  isInline(): boolean {
    return true
  }
}

export function $createTagNode(payload: TagPayload): TagNode {
  return $applyNodeReplacement(new TagNode(payload))
}

export function $isTagNode(node: any): node is TagNode {
  return node instanceof TagNode
}

