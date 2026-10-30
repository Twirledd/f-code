import Foundation

struct Greeter {
    let name: String
    func greet() -> String { "Hello, \(name)!" }
}

let g = Greeter(name: "Windows")
print(g.greet())
