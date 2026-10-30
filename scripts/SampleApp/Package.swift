// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SampleApp",
    targets: [
        .executableTarget(name: "SampleApp"),
        .testTarget(name: "SampleAppTests", dependencies: ["SampleApp"]),
    ]
)
