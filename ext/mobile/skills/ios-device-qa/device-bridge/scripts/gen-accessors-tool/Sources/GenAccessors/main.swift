// gen-accessors entry point. Walks the input dir for *.swift files, parses
// each via SwiftParser, finds @Observable classes with @Snapshotable-marked
// properties, and emits StateAccessor.swift for each.
//
// Output goes to --output (default: same dir as input). Cache key is
// computed from a composite hash and stored at
// .omp/ios-qa/cache/gen-accessors/<hash>/StateAccessor.swift.

import Foundation
import SwiftSyntax
import SwiftParser

struct AccessorSpec {
    let className: String
    let fields: [(name: String, typeText: String)]
}

@main
struct GenAccessors {
    static func main() async {
        let args = CommandLine.arguments
        guard let inputIdx = args.firstIndex(of: "--input"), args.count > inputIdx + 1 else {
            FileHandle.standardError.write(Data("usage: gen-accessors --input <dir> [--output <dir>]\n".utf8))
            exit(2)
        }
        let inputDir = args[inputIdx + 1]
        let outputDir: String = {
            if let idx = args.firstIndex(of: "--output"), args.count > idx + 1 {
                return args[idx + 1]
            }
            return inputDir
        }()

        // Walk + collect *.swift files
        guard let swiftFiles = collectSwiftFiles(at: inputDir) else {
            FileHandle.standardError.write(Data("input dir not found: \(inputDir)\n".utf8))
            exit(3)
        }

        // The composite key includes generator inputs as well as source content.
        let cacheKey = computeCacheKey(swiftFiles: swiftFiles)
        let qaHome = getEnv("OMP_IOS_QA_HOME") ?? (FileManager.default.currentDirectoryPath + "/.omp/ios-qa")
        let cacheDir = qaHome + "/cache/gen-accessors"
        let cachedOutput = "\(cacheDir)/\(cacheKey)/StateAccessor.swift"
        if FileManager.default.fileExists(atPath: cachedOutput) {
            // Cache hit. Copy to output dir.
            try? FileManager.default.removeItem(atPath: "\(outputDir)/StateAccessor.swift")
            try? FileManager.default.copyItem(atPath: cachedOutput, toPath: "\(outputDir)/StateAccessor.swift")
            print("gen-accessors: cache hit (\(cacheKey))")
            return
        }

        // Parse + extract specs
        var specs: [AccessorSpec] = []
        for path in swiftFiles {
            guard let source = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            let tree = Parser.parse(source: source)
            let visitor = ObservableClassVisitor(viewMode: .sourceAccurate)
            visitor.walk(tree)
            specs.append(contentsOf: visitor.specs)
        }

        // Emit
        let output = render(specs: specs, buildId: getEnv("APP_BUILD_ID") ?? "unknown", accessorHash: cacheKey)
        try? FileManager.default.createDirectory(atPath: outputDir, withIntermediateDirectories: true)
        try? output.write(toFile: "\(outputDir)/StateAccessor.swift", atomically: true, encoding: .utf8)

        // Populate cache
        try? FileManager.default.createDirectory(atPath: "\(cacheDir)/\(cacheKey)", withIntermediateDirectories: true)
        try? output.write(toFile: cachedOutput, atomically: true, encoding: .utf8)

        print("gen-accessors: wrote \(specs.count) accessor(s) to \(outputDir)/StateAccessor.swift")
    }

    static func collectSwiftFiles(at path: String) -> [String]? {
        guard let enumerator = FileManager.default.enumerator(atPath: path) else { return nil }
        var files: [String] = []
        for case let f as String in enumerator {
            if f.hasSuffix(".swift") { files.append("\(path)/\(f)") }
        }
        return files.sorted()
    }

    static func computeCacheKey(swiftFiles: [String]) -> String {
        // Include Swift version, generator revision, and platform in the hash.
        let swiftVer = getEnv("SWIFT_VERSION") ?? "unknown"
        let toolRev = getEnv("GEN_ACCESSORS_REV") ?? "dev"
        #if arch(arm64)
        let platform = "darwin-arm64"
        #elseif arch(x86_64)
        let platform = "darwin-x86_64"
        #else
        let platform = "darwin-unknown"
        #endif
        var combined = "swift=\(swiftVer)|tool=\(toolRev)|platform=\(platform)|"
        for path in swiftFiles {
            if let data = try? Data(contentsOf: URL(fileURLWithPath: path)) {
                combined += "\(path):\(data.count):\(data.sha256())|"
            }
        }
        return combined.data(using: .utf8)!.sha256()
    }

    static func render(specs: [AccessorSpec], buildId: String, accessorHash: String) -> String {
        var out = "// AUTO-GENERATED - DO NOT EDIT. Regenerate with ios-device-qa (sync mode).\n"
        out += "#if DEBUG\nimport Foundation\nimport DebugBridgeCore\n\n"
        for spec in specs {
            out += "@MainActor\npublic enum \(spec.className)Accessor {\n"
            out += "    public static func register(_ state: \(spec.className)) {\n"
            out += "        StateServer.shared.register(\n"
            out += "            buildId: \"\(buildId)\",\n"
            out += "            accessorHash: \"\(accessorHash)\",\n"
            out += "            atomicRestore: { keys in\n"
            for (name, typeText) in spec.fields {
                let raw = "raw_\(name)"
                let restored = "restored_\(name)"
                let optionalSuffix = typeText.hasSuffix("?")
                let optionalGeneric = typeText.hasPrefix("Optional<") && typeText.hasSuffix(">")
                let wrappedType = optionalSuffix
                    ? String(typeText.dropLast()).trimmingCharacters(in: .whitespaces)
                    : optionalGeneric
                        ? String(typeText.dropFirst("Optional<".count).dropLast()).trimmingCharacters(in: .whitespaces)
                        : typeText
                out += "                guard let \(raw) = keys[\"\(name)\"] else { return .missingKey(\"\(name)\") }\n"
                if optionalSuffix || optionalGeneric {
                    out += "                let \(restored): \(typeText)\n"
                    out += "                if \(raw) is NSNull {\n"
                    out += "                    \(restored) = nil\n"
                    out += "                } else {\n"
                    out += "                    guard let typed = \(raw) as? \(wrappedType) else { return .typeMismatch(\"\(name)\") }\n"
                    out += "                    \(restored) = typed\n"
                    out += "                }\n"
                } else {
                    out += "                guard let \(restored) = \(raw) as? \(typeText) else { return .typeMismatch(\"\(name)\") }\n"
                }
            }
            for (name, _) in spec.fields {
                out += "                state.\(name) = restored_\(name)\n"
            }
            out += "                return .ok\n"
            out += "            }\n"
            out += "        )\n"
            for (name, typeText) in spec.fields {
                let optionalSuffix = typeText.hasSuffix("?")
                let optionalGeneric = typeText.hasPrefix("Optional<") && typeText.hasSuffix(">")
                let wrappedType = optionalSuffix
                    ? String(typeText.dropLast()).trimmingCharacters(in: .whitespaces)
                    : optionalGeneric
                        ? String(typeText.dropFirst("Optional<".count).dropLast()).trimmingCharacters(in: .whitespaces)
                        : typeText
                out += "        StateServer.shared.registerAccessor(\n"
                out += "            key: \"\(name)\",\n"
                out += "            type: \"\(typeText)\",\n"
                out += "            read: { state.\(name) as Any? },\n"
                out += "            write: { raw in\n"
                if optionalSuffix || optionalGeneric {
                    out += "                if raw is NSNull { state.\(name) = nil; return true }\n"
                    out += "                guard let typed = raw as? \(wrappedType) else { return false }\n"
                } else {
                    out += "                guard let typed = raw as? \(typeText) else { return false }\n"
                }
                out += "                state.\(name) = typed\n"
                out += "                return true\n"
                out += "            }\n"
                out += "        )\n"
            }
            out += "    }\n}\n\n"
        }
        out += "#endif\n"
        return out
    }
}

final class ObservableClassVisitor: SyntaxVisitor {
    var specs: [AccessorSpec] = []

    override func visit(_ node: ClassDeclSyntax) -> SyntaxVisitorContinueKind {
        // Look for @Observable attribute
        let isObservable = node.attributes.contains(where: { attr in
            guard let attr = attr.as(AttributeSyntax.self) else { return false }
            return attr.attributeName.trimmedDescription == "Observable"
        })
        guard isObservable else { return .visitChildren }

        let className = node.name.text
        var fields: [(String, String)] = []

        for member in node.memberBlock.members {
            guard let varDecl = member.decl.as(VariableDeclSyntax.self) else { continue }
            let isSnapshotable = varDecl.attributes.contains(where: { attr in
                guard let attr = attr.as(AttributeSyntax.self) else { return false }
                return attr.attributeName.trimmedDescription == "Snapshotable"
            })
            guard isSnapshotable, varDecl.bindingSpecifier.text == "var" else { continue }
            let access = Set(varDecl.modifiers.map { $0.name.text })
            guard !access.contains("private"), !access.contains("fileprivate") else { continue }

            for binding in varDecl.bindings {
                guard let pattern = binding.pattern.as(IdentifierPatternSyntax.self),
                      let typeText = binding.typeAnnotation?.type.trimmedDescription else { continue }
                fields.append((pattern.identifier.text, typeText))
            }
        }

        if !fields.isEmpty {
            specs.append(AccessorSpec(className: className, fields: fields))
        }
        return .visitChildren
    }
}

func getEnv(_ key: String) -> String? {
    ProcessInfo.processInfo.environment[key]
}

import CryptoKit

extension Data {
    func sha256() -> String {
        SHA256.hash(data: self).map { String(format: "%02x", $0) }.joined()
    }
}

extension String {
    func sha256() -> String {
        Data(self.utf8).sha256()
    }
}
