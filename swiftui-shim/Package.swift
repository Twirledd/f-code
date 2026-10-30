// swift-tools-version: 5.9
// X-Code's clean-room SwiftUI-compatible module for Windows previews.
// The target is deliberately named `SwiftUI` so app code written as
// `import SwiftUI` compiles unchanged here and against Apple's SwiftUI on a Mac.
import PackageDescription

let package = Package(
    name: "XCodeSwiftUI",
    products: [
        .library(name: "SwiftUI", targets: ["SwiftUI"]),
    ],
    targets: [
        .target(name: "SwiftUI", path: "Sources/SwiftUI"),
    ]
)
