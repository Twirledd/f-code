import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import { swiftConfiguration, swiftLanguage } from './swift-monarch'
import type { LspCompletionItem, LspDiagnostic, LspHover } from '@shared/types'
import { useStore } from '@/state/store'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(self as any).MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'json') return new jsonWorker()
    return new editorWorker()
  }
}

monaco.languages.register({ id: 'swift', extensions: ['.swift'], aliases: ['Swift'] })
monaco.languages.setMonarchTokensProvider('swift', swiftLanguage)
monaco.languages.setLanguageConfiguration('swift', swiftConfiguration)

// Xcode "Default (Dark)" source colours.
monaco.editor.defineTheme('xcode-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'ffffff' },
    { token: 'keyword', foreground: 'fc5fa3', fontStyle: 'bold' },
    { token: 'keyword.directive', foreground: 'fd8f3f' },
    { token: 'annotation', foreground: 'fd8f3f' },
    { token: 'comment', foreground: '6c7986' },
    { token: 'comment.doc', foreground: '6c7986' },
    { token: 'string', foreground: 'fc6a5d' },
    { token: 'string.quote', foreground: 'fc6a5d' },
    { token: 'string.escape', foreground: 'fc6a5d' },
    { token: 'string.interp', foreground: 'fc6a5d' },
    { token: 'number', foreground: 'd0bf69' },
    { token: 'number.float', foreground: 'd0bf69' },
    { token: 'number.hex', foreground: 'd0bf69' },
    { token: 'constant', foreground: 'fc5fa3', fontStyle: 'bold' },
    { token: 'type', foreground: '5dd8ff' },
    { token: 'type.identifier', foreground: 'd0a8ff' },
    { token: 'function', foreground: '67b7a4' },
    { token: 'identifier', foreground: 'ffffff' },
    { token: 'variable.predefined', foreground: 'a167e6' },
    { token: 'operator', foreground: 'ffffff' },
    { token: 'delimiter', foreground: 'ffffff' }
  ],
  colors: {
    'editor.background': '#070b17',
    'editor.foreground': '#e8eef9',
    'editor.lineHighlightBackground': '#0c1428',
    'editor.selectionBackground': '#1d3a7a',
    'editor.inactiveSelectionBackground': '#16264a',
    'editorLineNumber.foreground': '#4f5f7d',
    'editorLineNumber.activeForeground': '#e8eef9',
    'editorCursor.foreground': '#7fe3ff',
    'editorIndentGuide.background1': '#1a2540',
    'editorIndentGuide.activeBackground1': '#2a3a5e',
    'editorGutter.background': '#070b17',
    'editorWidget.background': '#0c1428',
    'editorSuggestWidget.background': '#0c1428',
    'editorSuggestWidget.selectedBackground': '#1d4ed8',
    'editorHoverWidget.background': '#0c1428',
    'editorError.foreground': '#ff453a',
    'editorWarning.foreground': '#ffd60a',
    'minimap.background': '#070b17',
    'scrollbarSlider.background': '#8fa0be33',
    'scrollbarSlider.hoverBackground': '#8fa0be66'
  }
})

monaco.editor.defineTheme('xcode-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: '', foreground: '000000' },
    { token: 'keyword', foreground: '9b2393', fontStyle: 'bold' },
    { token: 'keyword.directive', foreground: '643820' },
    { token: 'annotation', foreground: '643820' },
    { token: 'comment', foreground: '5d6c79' },
    { token: 'comment.doc', foreground: '5d6c79' },
    { token: 'string', foreground: 'c41a16' },
    { token: 'string.quote', foreground: 'c41a16' },
    { token: 'string.escape', foreground: 'c41a16' },
    { token: 'string.interp', foreground: 'c41a16' },
    { token: 'number', foreground: '1c00cf' },
    { token: 'number.float', foreground: '1c00cf' },
    { token: 'constant', foreground: '9b2393', fontStyle: 'bold' },
    { token: 'type', foreground: '0b4f79' },
    { token: 'type.identifier', foreground: '3900a0' },
    { token: 'function', foreground: '326d74' },
    { token: 'variable.predefined', foreground: '3900a0' }
  ],
  colors: {
    'editor.background': '#ffffff',
    'editor.lineHighlightBackground': '#f2f6fc',
    'editor.selectionBackground': '#cfdcf7',
    'editorLineNumber.foreground': '#8493a8',
    'editorGutter.background': '#ffffff'
  }
})

// ---------------------------------------------------------------------------
// LSP → Monaco providers
// ---------------------------------------------------------------------------

/**
 * Map a model back to the exact path string the store uses. `uri.fsPath` lowercases the
 * drive letter on Windows, which would make breakpoint/diagnostic lookups miss.
 */
export function modelPath(model: monaco.editor.ITextModel): string | undefined {
  if (model.uri.scheme !== 'file') return undefined
  const key = model.uri.toString()
  const tab = useStore.getState().tabs.find((t) => monaco.Uri.file(t.path).toString() === key)
  return tab?.path ?? decodeURIComponent(model.uri.fsPath)
}
const pathOf = modelPath

const kindMap: Record<number, monaco.languages.CompletionItemKind> = {
  1: monaco.languages.CompletionItemKind.Text,
  2: monaco.languages.CompletionItemKind.Method,
  3: monaco.languages.CompletionItemKind.Function,
  4: monaco.languages.CompletionItemKind.Constructor,
  5: monaco.languages.CompletionItemKind.Field,
  6: monaco.languages.CompletionItemKind.Variable,
  7: monaco.languages.CompletionItemKind.Class,
  8: monaco.languages.CompletionItemKind.Interface,
  9: monaco.languages.CompletionItemKind.Module,
  10: monaco.languages.CompletionItemKind.Property,
  11: monaco.languages.CompletionItemKind.Unit,
  12: monaco.languages.CompletionItemKind.Value,
  13: monaco.languages.CompletionItemKind.Enum,
  14: monaco.languages.CompletionItemKind.Keyword,
  15: monaco.languages.CompletionItemKind.Snippet,
  17: monaco.languages.CompletionItemKind.File,
  18: monaco.languages.CompletionItemKind.Reference,
  20: monaco.languages.CompletionItemKind.EnumMember,
  21: monaco.languages.CompletionItemKind.Constant,
  22: monaco.languages.CompletionItemKind.Struct,
  25: monaco.languages.CompletionItemKind.TypeParameter
}

function toRange(r: { start: { line: number; character: number }; end: { line: number; character: number } }): monaco.IRange {
  return {
    startLineNumber: r.start.line + 1,
    startColumn: r.start.character + 1,
    endLineNumber: r.end.line + 1,
    endColumn: r.end.character + 1
  }
}

function docString(d: LspCompletionItem['documentation']): string | undefined {
  if (!d) return undefined
  return typeof d === 'string' ? d : d.value
}

monaco.languages.registerCompletionItemProvider('swift', {
  triggerCharacters: ['.', '(', ':', '@', '#'],
  async provideCompletionItems(model, position) {
    const path = pathOf(model)
    if (!path) return { suggestions: [] }
    const items = await window.xcode.lsp.completion(path, {
      line: position.lineNumber - 1,
      character: position.column - 1
    })
    const word = model.getWordUntilPosition(position)
    const defaultRange: monaco.IRange = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn
    }
    const suggestions: monaco.languages.CompletionItem[] = items.slice(0, 400).map((it) => {
      const insert = it.textEdit?.newText ?? it.insertText ?? it.label
      const isSnippet = /\$\{?\d/.test(insert)
      return {
        label: it.label,
        kind: kindMap[it.kind ?? 1] ?? monaco.languages.CompletionItemKind.Text,
        detail: it.detail,
        documentation: docString(it.documentation),
        insertText: insert,
        insertTextRules: isSnippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
        filterText: it.filterText,
        sortText: it.sortText,
        range: it.textEdit ? toRange(it.textEdit.range) : defaultRange
      }
    })
    return { suggestions, incomplete: items.length > 400 }
  }
})

function hoverMarkdown(h: LspHover): monaco.IMarkdownString[] {
  const c = h.contents
  const arr = Array.isArray(c) ? c : [c]
  return arr.map((x) => ({ value: typeof x === 'string' ? x : x.value }))
}

monaco.languages.registerHoverProvider('swift', {
  async provideHover(model, position) {
    const path = pathOf(model)
    if (!path) return null
    const h = await window.xcode.lsp.hover(path, { line: position.lineNumber - 1, character: position.column - 1 })
    if (!h) return null
    return { contents: hoverMarkdown(h), range: h.range ? toRange(h.range) : undefined }
  }
})

monaco.languages.registerDefinitionProvider('swift', {
  async provideDefinition(model, position) {
    const path = pathOf(model)
    if (!path) return null
    const locs = await window.xcode.lsp.definition(path, {
      line: position.lineNumber - 1,
      character: position.column - 1
    })
    if (!locs.length) return null
    // Open the target through our own tab system rather than letting Monaco try to resolve the model.
    const target = locs[0]
    void useStore.getState().openFile(target.path, target.range.start.line + 1, target.range.start.character + 1)
    return []
  }
})

/** Apply LSP diagnostics to the matching model as Monaco markers. */
export function applyDiagnostics(path: string, diags: LspDiagnostic[]): void {
  const model = monaco.editor.getModel(monaco.Uri.file(path))
  if (!model) return
  monaco.editor.setModelMarkers(
    model,
    'sourcekit-lsp',
    diags.map((d) => ({
      ...toRange(d.range),
      message: d.message,
      source: d.source ?? 'Swift',
      severity:
        d.severity === 1
          ? monaco.MarkerSeverity.Error
          : d.severity === 2
            ? monaco.MarkerSeverity.Warning
            : monaco.MarkerSeverity.Info
    }))
  )
}

export function languageForPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.swift')) return 'swift'
  if (lower.endsWith('.json') || lower.endsWith('.resolved')) return 'json'
  if (lower.endsWith('.md')) return 'markdown'
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml'
  if (lower.endsWith('.c') || lower.endsWith('.h')) return 'c'
  if (lower.endsWith('.cpp') || lower.endsWith('.hpp')) return 'cpp'
  if (lower.endsWith('.plist') || lower.endsWith('.xml')) return 'xml'
  return 'plaintext'
}

export { monaco }
