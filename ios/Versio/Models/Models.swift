import Foundation

// MARK: Spotify

struct PlaybackState: Decodable {
    let isPlaying: Bool
    let progressMs: Int?
    let currentlyPlayingType: String?
    let item: SpotifyTrack?
    let device: Device?

    struct Device: Decodable {
        let name: String
        let isPrivateSession: Bool?
    }
}

struct SpotifyTrack: Decodable, Equatable {
    let id: String?
    let uri: String
    let name: String
    let durationMs: Int
    let isLocal: Bool?
    let artists: [Artist]
    let album: Album

    struct Artist: Decodable, Equatable { let name: String }
    struct Album: Decodable, Equatable {
        let name: String
        let images: [Image]
    }
    struct Image: Decodable, Equatable {
        let url: String
        let width: Int?
    }

    var key: String { id ?? uri }
    var artistLine: String { artists.map(\.name).joined(separator: ", ") }
    var artURL: URL? {
        let sorted = album.images.sorted { ($0.width ?? 0) > ($1.width ?? 0) }
        return sorted.first.flatMap { URL(string: $0.url) }
    }
}

// MARK: Versio API

struct AccessInfo: Decodable {
    let accessControl: Bool
    let spotifyId: String
    let displayName: String?
    let role: String
    let status: String
}

struct AppConfig: Decodable {
    let provider: String
    let explanations: Bool
    let pronunciation: Bool?
}

struct LyricLine: Decodable, Identifiable, Equatable {
    let id: Int
    let timeMs: Int?
    let text: String
}

struct LyricsResult: Decodable {
    let kind: String // synced | plain | instrumental | not_found
    let lines: [LyricLine]
}

struct TranslateResponse: Decodable {
    let translations: [String: String]
    let sourceLanguage: String?
}

struct RomanizeResponse: Decodable {
    let romanizations: [String: String]
}

struct Explanation: Decodable {
    struct Term: Decodable, Hashable {
        let term: String
        let meaning: String
    }
    let literal: String
    let natural: String
    let slang: [Term]
    let cultural: String
    let vocabulary: [Term]
}

// MARK: Languages

struct Language: Identifiable, Hashable {
    let code: String
    let name: String
    var id: String { code }

    static let all: [Language] = [
        .init(code: "de", name: "Deutsch"), .init(code: "en", name: "English"), .init(code: "fr", name: "Français"),
        .init(code: "it", name: "Italiano"), .init(code: "es", name: "Español"), .init(code: "pt", name: "Português"),
        .init(code: "ja", name: "日本語"), .init(code: "ko", name: "한국어"), .init(code: "ar", name: "العربية"),
        .init(code: "tr", name: "Türkçe"), .init(code: "nl", name: "Nederlands"), .init(code: "pl", name: "Polski"),
        .init(code: "sv", name: "Svenska"), .init(code: "da", name: "Dansk"), .init(code: "nb", name: "Norsk"),
        .init(code: "fi", name: "Suomi"), .init(code: "el", name: "Ελληνικά"), .init(code: "cs", name: "Čeština"),
        .init(code: "ro", name: "Română"), .init(code: "hu", name: "Magyar"), .init(code: "uk", name: "Українська"),
        .init(code: "ru", name: "Русский"), .init(code: "zh", name: "中文（简体）"), .init(code: "id", name: "Bahasa Indonesia"),
        .init(code: "hi", name: "हिन्दी"), .init(code: "he", name: "עברית"), .init(code: "th", name: "ไทย"),
        .init(code: "vi", name: "Tiếng Việt"), .init(code: "sq", name: "Shqip"), .init(code: "hr", name: "Hrvatski"),
        .init(code: "sr", name: "Srpski"),
    ]

    static func name(for code: String?) -> String {
        guard let code else { return "" }
        let base = String(code.lowercased().prefix(2))
        return all.first { $0.code == base }?.name
            ?? Locale(identifier: "en").localizedString(forLanguageCode: base)
            ?? base.uppercased()
    }
}

enum DisplayMode: String, CaseIterable, Identifiable {
    case both, original, translation
    var id: String { rawValue }
    var label: String {
        switch self {
        case .both: return "Both"
        case .original: return "Original"
        case .translation: return "Translation"
        }
    }
}
