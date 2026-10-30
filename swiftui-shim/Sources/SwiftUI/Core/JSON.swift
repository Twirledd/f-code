// Minimal JSON value + serializer used for the preview wire protocol.
// Kept dependency-free so the shim builds on any Swift for Windows toolchain.
import Foundation

public enum JSON: Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSON])
    case object([String: JSON])

    public func serialize() -> String {
        var out = ""
        write(into: &out)
        return out
    }

    func write(into out: inout String) {
        switch self {
        case .null: out += "null"
        case .bool(let b): out += b ? "true" : "false"
        case .number(let n):
            if n.isNaN || n.isInfinite { out += "null" }
            else if n == n.rounded() && abs(n) < 1e15 { out += String(Int64(n)) }
            else { out += String(n) }
        case .string(let s): JSON.writeString(s, into: &out)
        case .array(let a):
            out += "["
            for (i, v) in a.enumerated() {
                if i > 0 { out += "," }
                v.write(into: &out)
            }
            out += "]"
        case .object(let o):
            out += "{"
            var first = true
            for key in o.keys.sorted() {
                if !first { out += "," }
                first = false
                JSON.writeString(key, into: &out)
                out += ":"
                o[key]!.write(into: &out)
            }
            out += "}"
        }
    }

    static func writeString(_ s: String, into out: inout String) {
        out += "\""
        for ch in s.unicodeScalars {
            switch ch {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if ch.value < 0x20 {
                    out += String(format: "\\u%04x", ch.value)
                } else {
                    out.unicodeScalars.append(ch)
                }
            }
        }
        out += "\""
    }

    // Accessors used when decoding events from the host.
    public var stringValue: String? { if case .string(let s) = self { return s }; return nil }
    public var doubleValue: Double? {
        if case .number(let n) = self { return n }
        if case .string(let s) = self { return Double(s) }
        return nil
    }
    public var boolValue: Bool? { if case .bool(let b) = self { return b }; return nil }
    public var objectValue: [String: JSON]? { if case .object(let o) = self { return o }; return nil }
    public subscript(key: String) -> JSON { objectValue?[key] ?? .null }
}

extension JSON: ExpressibleByStringLiteral, ExpressibleByIntegerLiteral, ExpressibleByFloatLiteral,
    ExpressibleByBooleanLiteral, ExpressibleByArrayLiteral, ExpressibleByDictionaryLiteral, ExpressibleByNilLiteral {
    public init(stringLiteral value: String) { self = .string(value) }
    public init(integerLiteral value: Int) { self = .number(Double(value)) }
    public init(floatLiteral value: Double) { self = .number(value) }
    public init(booleanLiteral value: Bool) { self = .bool(value) }
    public init(arrayLiteral elements: JSON...) { self = .array(elements) }
    public init(dictionaryLiteral elements: (String, JSON)...) {
        var o: [String: JSON] = [:]
        for (k, v) in elements { o[k] = v }
        self = .object(o)
    }
    public init(nilLiteral: ()) { self = .null }
}

extension JSON {
    public init(_ d: Double) { self = .number(d) }
    public init(_ d: CGFloat) { self = .number(Double(d)) }
    public init(_ i: Int) { self = .number(Double(i)) }
    public init(_ s: String) { self = .string(s) }
    public init(_ b: Bool) { self = .bool(b) }
    public init(_ a: [JSON]) { self = .array(a) }
    public init(_ o: [String: JSON]) { self = .object(o) }
    public static func optional(_ d: Double?) -> JSON { d.map { .number($0) } ?? .null }
    public static func optional(_ d: CGFloat?) -> JSON { d.map { .number(Double($0)) } ?? .null }
    public static func optional(_ s: String?) -> JSON { s.map { .string($0) } ?? .null }
}

// A tiny recursive-descent parser for host → app messages.
struct JSONParser {
    private let chars: [Character]
    private var i = 0

    init(_ text: String) { chars = Array(text) }

    static func parse(_ text: String) -> JSON? {
        var p = JSONParser(text)
        p.skipWS()
        guard let v = p.parseValue() else { return nil }
        return v
    }

    private mutating func skipWS() {
        while i < chars.count, chars[i].isWhitespace { i += 1 }
    }
    private mutating func parseValue() -> JSON? {
        skipWS()
        guard i < chars.count else { return nil }
        switch chars[i] {
        case "{": return parseObject()
        case "[": return parseArray()
        case "\"": return parseString().map { .string($0) }
        case "t": return consume("true") ? .bool(true) : nil
        case "f": return consume("false") ? .bool(false) : nil
        case "n": return consume("null") ? .null : nil
        default: return parseNumber()
        }
    }
    private mutating func consume(_ word: String) -> Bool {
        let w = Array(word)
        guard i + w.count <= chars.count, Array(chars[i..<i + w.count]) == w else { return false }
        i += w.count
        return true
    }
    private mutating func parseNumber() -> JSON? {
        let start = i
        while i < chars.count, "+-0123456789.eE".contains(chars[i]) { i += 1 }
        return Double(String(chars[start..<i])).map { .number($0) }
    }
    private mutating func parseString() -> String? {
        guard i < chars.count, chars[i] == "\"" else { return nil }
        i += 1
        var out = ""
        while i < chars.count {
            let c = chars[i]
            i += 1
            if c == "\"" { return out }
            if c == "\\", i < chars.count {
                let e = chars[i]
                i += 1
                switch e {
                case "n": out += "\n"
                case "r": out += "\r"
                case "t": out += "\t"
                case "b": out += "\u{8}"
                case "f": out += "\u{c}"
                case "u":
                    guard i + 4 <= chars.count, let code = UInt32(String(chars[i..<i + 4]), radix: 16) else { return nil }
                    i += 4
                    if let scalar = Unicode.Scalar(code) { out.unicodeScalars.append(scalar) }
                default: out.append(e)
                }
            } else {
                out.append(c)
            }
        }
        return nil
    }
    private mutating func parseArray() -> JSON? {
        i += 1
        var arr: [JSON] = []
        skipWS()
        if i < chars.count, chars[i] == "]" { i += 1; return .array(arr) }
        while i < chars.count {
            guard let v = parseValue() else { return nil }
            arr.append(v)
            skipWS()
            guard i < chars.count else { return nil }
            if chars[i] == "," { i += 1; continue }
            if chars[i] == "]" { i += 1; return .array(arr) }
            return nil
        }
        return nil
    }
    private mutating func parseObject() -> JSON? {
        i += 1
        var obj: [String: JSON] = [:]
        skipWS()
        if i < chars.count, chars[i] == "}" { i += 1; return .object(obj) }
        while i < chars.count {
            skipWS()
            guard let k = parseString() else { return nil }
            skipWS()
            guard i < chars.count, chars[i] == ":" else { return nil }
            i += 1
            guard let v = parseValue() else { return nil }
            obj[k] = v
            skipWS()
            guard i < chars.count else { return nil }
            if chars[i] == "," { i += 1; continue }
            if chars[i] == "}" { i += 1; return .object(obj) }
            return nil
        }
        return nil
    }
}
