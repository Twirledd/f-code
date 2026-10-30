// swift-tools-version: 5.9
import PackageDescription

// On Windows the clean-room SwiftUI shim stands in for Apple's framework; on a Mac the real one is used.
var dependencies: [Package.Dependency] = []
var appDependencies: [Target.Dependency] = []
#if os(Windows)
dependencies.append(.package(path: "../../swiftui-shim"))
appDependencies.append(.product(name: "SwiftUI", package: "swiftui-shim"))
#endif

let package = Package(
    name: "PreviewApp",
    platforms: [.iOS(.v17), .macOS(.v14)],
    dependencies: dependencies,
    targets: [
        .executableTarget(name: "PreviewApp", dependencies: appDependencies),
    ]
)
