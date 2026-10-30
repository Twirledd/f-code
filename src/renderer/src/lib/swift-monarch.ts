import type * as monaco from 'monaco-editor'

/** Monarch tokenizer for Swift, tuned so Xcode's theme colours land on the right tokens. */
export const swiftLanguage: monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.swift',

  keywords: [
    'associatedtype', 'class', 'deinit', 'enum', 'extension', 'fileprivate', 'func', 'import', 'init', 'inout',
    'internal', 'let', 'open', 'operator', 'private', 'precedencegroup', 'protocol', 'public', 'rethrows', 'static',
    'struct', 'subscript', 'typealias', 'var', 'actor', 'macro', 'package', 'break', 'case', 'catch', 'continue',
    'default', 'defer', 'do', 'else', 'fallthrough', 'for', 'guard', 'if', 'in', 'repeat', 'return', 'throw',
    'switch', 'where', 'while', 'as', 'await', 'async', 'is', 'super', 'throws', 'try', 'some', 'any', 'nonisolated',
    'isolated', 'consuming', 'borrowing', 'each', 'lazy', 'mutating', 'nonmutating', 'override', 'required',
    'convenience', 'dynamic', 'final', 'indirect', 'infix', 'optional', 'postfix', 'prefix', 'unowned', 'weak',
    'willSet', 'didSet', 'get', 'set', 'Any', 'Type', 'Protocol'
  ],
  constants: ['true', 'false', 'nil', 'self', 'Self'],
  types: [
    'Int', 'Int8', 'Int16', 'Int32', 'Int64', 'UInt', 'UInt8', 'UInt16', 'UInt32', 'UInt64', 'Float', 'Double',
    'Bool', 'String', 'Character', 'Array', 'Dictionary', 'Set', 'Optional', 'Result', 'Error', 'Void', 'Never',
    'Range', 'ClosedRange', 'Substring', 'AnyObject', 'Data', 'Date', 'URL', 'UUID', 'Decimal', 'Task', 'Sendable',
    'Hashable', 'Equatable', 'Comparable', 'Codable', 'Encodable', 'Decodable', 'Identifiable', 'CustomStringConvertible'
  ],

  operators: /[=><!~?:&|+\-*\/\^%.]+/,
  symbols: /[=><!~?:&|+\-*\/\^%]+/,
  escapes: /\\(?:[0tnr"'\\]|u\{[0-9A-Fa-f]{1,8}\})/,

  tokenizer: {
    root: [
      [/#(if|else|elseif|endif|available|unavailable|selector|keyPath|file|line|column|function|warning|error|sourceLocation|Preview)\b/, 'keyword.directive'],
      [/@[A-Za-z_][\w]*/, 'annotation'],
      [/\$[0-9]+/, 'variable.predefined'],
      [/`[A-Za-z_][\w]*`/, 'identifier'],
      [/[A-Z][\w]*/, { cases: { '@types': 'type.identifier', '@constants': 'constant', '@default': 'type' } }],
      [/[a-z_][\w]*(?=\s*\()/, { cases: { '@keywords': 'keyword', '@constants': 'constant', '@default': 'function' } }],
      [/[a-z_][\w]*/, { cases: { '@keywords': 'keyword', '@constants': 'constant', '@default': 'identifier' } }],
      { include: '@whitespace' },
      [/[{}()\[\]]/, '@brackets'],
      [/@symbols/, 'operator'],
      [/0x[0-9a-fA-F_]+/, 'number.hex'],
      [/0o[0-7_]+/, 'number.octal'],
      [/0b[01_]+/, 'number.binary'],
      [/\d[\d_]*\.\d[\d_]*([eE][+-]?\d+)?/, 'number.float'],
      [/\d[\d_]*/, 'number'],
      [/"""/, { token: 'string.quote', bracket: '@open', next: '@multistring' }],
      [/#+"/, { token: 'string.quote', bracket: '@open', next: '@rawstring' }],
      [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],
      [/[;,.]/, 'delimiter']
    ],
    whitespace: [
      [/[ \t\r\n]+/, 'white'],
      [/\/\*\*(?!\/)/, 'comment.doc', '@doccomment'],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/\/.*$/, 'comment.doc'],
      [/\/\/.*$/, 'comment']
    ],
    comment: [
      [/[^\/*]+/, 'comment'],
      [/\/\*/, 'comment', '@push'],
      [/\*\//, 'comment', '@pop'],
      [/[\/*]/, 'comment']
    ],
    doccomment: [
      [/[^\/*]+/, 'comment.doc'],
      [/\/\*/, 'comment.doc', '@push'],
      [/\*\//, 'comment.doc', '@pop'],
      [/[\/*]/, 'comment.doc']
    ],
    string: [
      [/[^\\"]+/, 'string'],
      [/\\\(/, { token: 'string.interp', next: '@interp' }],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
    ],
    multistring: [
      [/[^\\"]+/, 'string'],
      [/\\\(/, { token: 'string.interp', next: '@interp' }],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"""/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
      [/"/, 'string']
    ],
    rawstring: [
      [/[^"#]+/, 'string'],
      [/"#+/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
      [/["#]/, 'string']
    ],
    interp: [
      [/\(/, 'string.interp', '@push'],
      [/\)/, { token: 'string.interp', next: '@pop' }],
      { include: 'root' }
    ]
  }
}

export const swiftConfiguration: monaco.languages.LanguageConfiguration = {
  comments: { lineComment: '//', blockComment: ['/*', '*/'] },
  brackets: [['{', '}'], ['[', ']'], ['(', ')']],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string'] },
    { open: '`', close: '`' }
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' }
  ],
  indentationRules: {
    increaseIndentPattern: /^.*\{[^}"']*$|^.*\([^)"']*$/,
    decreaseIndentPattern: /^\s*[}\)].*$/
  },
  onEnterRules: [
    {
      beforeText: /^\s*\/\/\/.*$/,
      action: { indentAction: 0 as monaco.languages.IndentAction, appendText: '/// ' }
    }
  ]
}
