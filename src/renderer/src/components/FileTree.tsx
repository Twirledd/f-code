import React, { useState } from 'react'
import type { FileNode } from '@shared/types'
import { useStore } from '@/state/store'
import { Chevron, FileGeneric, FileSwift, Folder, Package } from './Icons'

export function FileIcon({ kind, name }: { kind: FileNode['kind']; name?: string }): JSX.Element {
  switch (kind) {
    case 'swift':
      return <FileSwift className="icon-swift" />
    case 'package':
      return <Package className="icon-package" />
    case 'folder':
      return <Folder className="icon-folder" />
    case 'json':
      return <FileGeneric className="icon-json" />
    case 'markdown':
      return <FileGeneric className="icon-md" />
    default:
      return <FileGeneric className="icon-text" style={name?.endsWith('.gitignore') ? { opacity: 0.6 } : undefined} />
  }
}

interface Props {
  node: FileNode
  depth?: number
  filter?: string
  onContextMenu?: (node: FileNode, e: React.MouseEvent) => void
  renaming?: string
  onRename?: (node: FileNode, newName: string) => void
}

export function FileTree(props: Props): JSX.Element | null {
  const { node, depth = 0, filter, onContextMenu, renaming, onRename } = props
  const expanded = useStore((s) => s.expanded[node.path] ?? false)
  const selected = useStore((s) => s.selectedPath === node.path)
  const toggle = useStore((s) => s.toggleExpanded)
  const openFile = useStore((s) => s.openFile)
  const set = useStore((s) => s.set)
  const [draft, setDraft] = useState(node.name)

  const isFolder = node.kind === 'folder'
  const matches = (n: FileNode): boolean => {
    if (!filter) return true
    if (n.name.toLowerCase().includes(filter.toLowerCase())) return true
    return !!n.children?.some(matches)
  }
  if (!matches(node)) return null
  const open = filter ? true : expanded

  const onClick = (): void => {
    set({ selectedPath: node.path })
    if (isFolder) toggle(node.path)
    else void openFile(node.path)
  }

  return (
    <>
      <div
        className={`row ${selected ? 'selected' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={onClick}
        onContextMenu={(e) => {
          e.preventDefault()
          set({ selectedPath: node.path })
          onContextMenu?.(node, e)
        }}
        title={node.path}
      >
        <span
          className={`disclosure ${open ? 'open' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            if (isFolder) toggle(node.path)
          }}
        >
          {isFolder && node.children && node.children.length > 0 ? <Chevron /> : null}
        </span>
        <span className="row-icon">
          <FileIcon kind={node.kind} name={node.name} />
        </span>
        {renaming === node.path ? (
          <input
            className="rename"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRename?.(node, draft)
              if (e.key === 'Escape') onRename?.(node, node.name)
            }}
            onBlur={() => onRename?.(node, draft)}
          />
        ) : (
          <span className="label">{node.name}</span>
        )}
      </div>
      {isFolder && open && node.children?.map((c) => <FileTree key={c.path} {...props} node={c} depth={depth + 1} />)}
    </>
  )
}
