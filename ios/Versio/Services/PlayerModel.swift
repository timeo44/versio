import CoreImage
import SwiftUI
import UIKit

/// Polls Spotify, keeps a smooth playback clock, and loads lyrics,
/// translations and pronunciation for the current track.
@MainActor
@Observable
final class PlayerModel {
    enum Phase: Equatable {
        case loading, playing, paused
        case idle(String)
        case error(String)
    }

    enum LyricsState: Equatable {
        case idle, loading
        case ready(kind: String)
        case error(String)
    }

    // playback
    var phase: Phase = .loading
    var track: SpotifyTrack?
    var deviceName: String?
    var deviceType: String?
    var deviceRestricted = false
    /// transient error from play/pause/skip/seek
    var controlError: String?
    var artwork: UIImage?
    var accent: Color = Color(white: 0.25)
    var accentText: Color = Color(white: 0.85)
    var rateLimited = false

    // lyrics
    var lyricsState: LyricsState = .idle
    var lines: [LyricLine] = []
    var synced = false
    var activeIndex = -1

    // translation
    var translations: [String: String] = [:]
    var pronunciations: [String: String] = [:]
    var sourceLanguage: String?
    var translating = false
    var translationError: String?
    var config: AppConfig?

    // settings (set by the views from @AppStorage)
    var target = "de"
    var showPronunciation = false
    /// timing offset of the current Spotify device (+ = lyrics earlier)
    private(set) var offsetMs: Double = 0
    var deviceKey: String { DeviceOffsets.key(name: deviceName ?? "unknown", type: deviceType) }

    // clock anchor
    @ObservationIgnored private var progressMs: Double = 0
    @ObservationIgnored private var anchor = Date()
    @ObservationIgnored private var isPlaying = false

    @ObservationIgnored private var pollTask: Task<Void, Never>?
    @ObservationIgnored private var tickTask: Task<Void, Never>?
    @ObservationIgnored private var trackTask: Task<Void, Never>?
    @ObservationIgnored private var translateTask: Task<Void, Never>?

    var sameLanguage: Bool {
        guard let s = sourceLanguage else { return false }
        return s.prefix(2).lowercased() == target.prefix(2).lowercased()
    }

    // MARK: Lifecycle

    func start() {
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                let wait = await self?.poll() ?? 5
                try? await Task.sleep(for: .seconds(wait))
            }
        }
        tickTask = Task { [weak self] in
            while !Task.isCancelled {
                self?.tick()
                try? await Task.sleep(for: .milliseconds(100))
            }
        }
        if config == nil {
            Task { [weak self] in self?.config = try? await VersioAPI.config() }
        }
    }

    /// Poll again right away (after a command), restarting the loop.
    private func pollNow() {
        pollTask?.cancel()
        pollTask = nil
        tickTask?.cancel()
        tickTask = nil
        start()
    }

    func stop() {
        pollTask?.cancel()
        pollTask = nil
        tickTask?.cancel()
        tickTask = nil
    }

    // MARK: Clock

    /// Current playback position in ms (extrapolated between polls).
    func position(at date: Date, includeOffset: Bool = true) -> Double {
        var p = progressMs
        if isPlaying { p += date.timeIntervalSince(anchor) * 1000 }
        if includeOffset { p += offsetMs }
        let duration = Double(track?.durationMs ?? Int.max)
        return min(max(0, p), duration)
    }

    private func tick() {
        guard synced, !lines.isEmpty else {
            if activeIndex != -1 { activeIndex = -1 }
            return
        }
        let idx = Self.activeIndex(in: lines, at: position(at: Date()))
        if idx != activeIndex { activeIndex = idx }
    }

    static func activeIndex(in lines: [LyricLine], at ms: Double) -> Int {
        var lo = 0, hi = lines.count - 1, ans = -1
        while lo <= hi {
            let mid = (lo + hi) / 2
            guard let t = lines[mid].timeMs else { return -1 }
            if Double(t) <= ms { ans = mid; lo = mid + 1 } else { hi = mid - 1 }
        }
        return ans
    }

    // MARK: Polling

    /// Returns seconds until the next poll.
    private func poll() async -> Double {
        let t0 = Date()
        do {
            guard let s = try await SpotifyAPI.playbackState() else {
                // Spotify drops the player a while after pausing — keep showing the song
                if track != nil, !isPlaying {
                    phase = .paused
                    return 5
                }
                setIdle("Nothing is playing on Spotify right now.")
                return 5
            }
            let sampledAt = t0.addingTimeInterval(Date().timeIntervalSince(t0) / 2)
            rateLimited = false
            if s.device?.name != deviceName || s.device?.type != deviceType {
                deviceName = s.device?.name
                deviceType = s.device?.type
                offsetMs = DeviceOffsets.offset(for: deviceKey)
            }
            deviceRestricted = s.device?.isRestricted == true

            if s.currentlyPlayingType == "ad" {
                phase = .idle("An ad is playing — lyrics resume with the next song.")
                return 3
            }
            if s.currentlyPlayingType == "episode" {
                setIdle("Podcast episodes don't have lyrics.")
                return 5
            }
            guard let item = s.item else {
                setIdle(s.device?.isPrivateSession == true ? "Spotify is in a private session — track info is hidden." : "Spotify isn't sharing track info right now.")
                return 5
            }

            let progress = Double(s.progressMs ?? 0)
            let sameTrack = item.key == track?.key
            // ignore small jitter so the highlighted line doesn't flicker
            if sameTrack, isPlaying, s.isPlaying {
                let predicted = position(at: sampledAt, includeOffset: false)
                if abs(predicted - progress) > 350 {
                    progressMs = progress
                    anchor = sampledAt
                }
            } else {
                progressMs = progress
                anchor = sampledAt
            }
            isPlaying = s.isPlaying
            phase = s.isPlaying ? .playing : .paused

            if !sameTrack {
                track = item
                trackChanged(item)
            }

            if s.isPlaying {
                let remaining = Double(item.durationMs) - progress
                return remaining > 0 && remaining < 1500 ? remaining / 1000 + 0.4 : 1.5
            }
            return 3
        } catch APIError.rateLimited(let seconds) {
            rateLimited = true
            return seconds
        } catch AuthError.expired {
            SpotifyAuth.shared.logout()
            return 30
        } catch APIError.spotifyNotRegistered {
            phase = .error(APIError.spotifyNotRegistered.localizedDescription)
            return 30
        } catch {
            if track == nil { phase = .error(error.localizedDescription) }
            return 5
        }
    }

    private func setIdle(_ message: String) {
        phase = .idle(message)
        isPlaying = false
        if track != nil {
            track = nil
            trackTask?.cancel()
            translateTask?.cancel()
            resetLyrics()
            artwork = nil
        }
    }

    private func resetLyrics() {
        lines = []
        synced = false
        activeIndex = -1
        lyricsState = .idle
        translations = [:]
        pronunciations = [:]
        sourceLanguage = nil
        translationError = nil
        translating = false
    }

    // MARK: Controls

    func togglePlay() {
        if isPlaying { pause() } else { play() }
    }

    func play() {
        command({ try await SpotifyAPI.play() }, optimistic: {
            self.progressMs = self.position(at: Date(), includeOffset: false)
            self.anchor = Date()
            self.isPlaying = true
            self.phase = .playing
        })
    }

    func pause() {
        command({ try await SpotifyAPI.pause() }, optimistic: {
            self.progressMs = self.position(at: Date(), includeOffset: false)
            self.anchor = Date()
            self.isPlaying = false
            self.phase = .paused
        })
    }

    func next() { command({ try await SpotifyAPI.next() }, optimistic: {}) }
    func previous() { command({ try await SpotifyAPI.previous() }, optimistic: {}) }

    /// Seek to a song position (ms, without offset).
    func seek(toMs ms: Double) {
        let target = max(0, min(ms, Double(track?.durationMs ?? 0)))
        command({ try await SpotifyAPI.seek(toMs: Int(target)) }, optimistic: {
            self.progressMs = target
            self.anchor = Date()
        })
    }

    /// Jump to a lyric line (synced lyrics only), slightly early so it's heard from the start.
    func seek(toLine index: Int) {
        guard synced, lines.indices.contains(index), let t = lines[index].timeMs else { return }
        seek(toMs: Double(t) - offsetMs - 250)
        activeIndex = index
    }

    private func command(_ op: @escaping () async throws -> Void, optimistic: @escaping () -> Void) {
        controlError = nil
        optimistic()
        Task { [weak self] in
            do {
                try await op()
                try? await Task.sleep(for: .milliseconds(350))
                self?.pollNow()
            } catch {
                let message = error.localizedDescription
                self?.controlError = message
                self?.pollNow()
                try? await Task.sleep(for: .seconds(4))
                if self?.controlError == message { self?.controlError = nil }
            }
        }
    }

    // MARK: Timing offset

    func setOffset(_ ms: Double) {
        let clamped = min(DeviceOffsets.maxOffsetMs, max(-DeviceOffsets.maxOffsetMs, (ms / 10).rounded() * 10))
        offsetMs = clamped
        DeviceOffsets.set(clamped, key: deviceKey, name: deviceName ?? "This device", type: deviceType)
    }

    /// Re-read the offset after the saved-devices list changed in Settings.
    func reloadOffset() {
        offsetMs = DeviceOffsets.offset(for: deviceKey)
    }

    /// The user tapped the moment line `index` started being sung (150 ms reaction time).
    func calibrate(tappedLine index: Int, at date: Date) {
        guard lines.indices.contains(index), let t = lines[index].timeMs else { return }
        setOffset(Double(t) - position(at: date, includeOffset: false) + 150)
    }

    /// Listens through the microphone and aligns what was heard with the lyrics.
    func calibrateByListening(recorder: ListenRecorder) async throws -> (offsetMs: Double, matched: Int) {
        guard let track, synced else { throw CalibrationError.nothingMatched }
        let clip = try await recorder.record()
        let result = try await VersioAPI.transcribe(audio: clip.data, mime: "audio/mp4", title: track.name, artist: track.artistLine)
        let start = clip.startedAt
        let positions = result.words.map { position(at: start.addingTimeInterval($0.start), includeOffset: false) }
        var lookup: [Double: Double] = [:]
        for (w, p) in zip(result.words, positions) { lookup[w.start] = p }
        guard let aligned = LyricAligner.align(
            lines: lines,
            heard: result.words,
            songMsAt: { sec in lookup[sec] ?? 0 },
            currentOffsetMs: offsetMs
        ) else { throw CalibrationError.nothingMatched }
        setOffset(aligned.offsetMs)
        return (offsetMs, aligned.matches.count)
    }

    // MARK: Track change

    private func trackChanged(_ item: SpotifyTrack) {
        trackTask?.cancel()
        translateTask?.cancel()
        resetLyrics()
        loadArtwork(item)
        trackTask = Task { [weak self] in
            guard let self else { return }
            await self.loadLyrics(item)
            guard !Task.isCancelled, self.track?.key == item.key else { return }
            self.retranslate()
        }
    }

    private func loadLyrics(_ item: SpotifyTrack) async {
        lyricsState = .loading
        do {
            let r = try await VersioAPI.lyrics(for: item)
            guard !Task.isCancelled, track?.key == item.key else { return }
            lines = r.lines
            synced = r.kind == "synced"
            lyricsState = .ready(kind: r.kind)
        } catch {
            guard track?.key == item.key else { return }
            lyricsState = .error(error.localizedDescription)
        }
    }

    private func loadArtwork(_ item: SpotifyTrack) {
        artwork = nil
        guard let url = item.artURL else { return }
        Task { [weak self] in
            guard let result = try? await URLSession.shared.data(from: url), let img = UIImage(data: result.0) else { return }
            guard let self, self.track?.key == item.key else { return }
            self.artwork = img
            if let c = Self.averageColor(img) {
                self.accent = Color(uiColor: c)
                self.accentText = Color(uiColor: Self.mix(c, with: .white, amount: 0.68))
            }
        }
    }

    // MARK: Translation + pronunciation

    /// (Re)loads translation and pronunciation for the current track — call after
    /// the target language or pronunciation setting changes.
    func retranslate() {
        translateTask?.cancel()
        translateTask = Task { [weak self] in
            await self?.translateAll()
            await self?.romanizeIfNeeded()
        }
    }

    private func translateAll() async {
        guard let track, !lines.isEmpty, (config?.provider ?? "openai") != "none" else { return }
        let cacheKey = "tr.\(target).\(track.key)"
        let cached = TranslationCache.load(cacheKey)
        translations = cached?.map ?? [:]
        sourceLanguage = cached?.src
        translationError = nil
        if sameLanguage { return }

        // unique lines, starting at the current one so it is translated first
        let start = max(0, activeIndex)
        let ordered = Array(lines[start...]) + Array(lines[..<start])
        var seen = Set<String>()
        let missing = ordered.map { $0.text.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && translations[$0] == nil && seen.insert($0).inserted }
        guard !missing.isEmpty else { return }

        let chunks = stride(from: 0, to: missing.count, by: 14).map { Array(missing[$0..<min($0 + 14, missing.count)]) }
        let title = track.name, artist = track.artistLine, targetLang = self.target
        let lyrics = lines.map(\.text).joined(separator: "\n")
        let key = track.key

        translating = true
        defer { translating = false }
        do {
            let first = try await VersioAPI.translate(chunks[0], target: targetLang, title: title, artist: artist, lyrics: lyrics)
            guard !Task.isCancelled, self.track?.key == key else { return }
            apply(first, cacheKey: cacheKey)
            if sameLanguage || chunks.count == 1 { return }

            try await withThrowingTaskGroup(of: TranslateResponse.self) { group in
                for chunk in chunks.dropFirst() {
                    group.addTask { try await VersioAPI.translate(chunk, target: targetLang, title: title, artist: artist, lyrics: lyrics) }
                }
                for try await r in group {
                    guard !Task.isCancelled, self.track?.key == key else { return }
                    apply(r, cacheKey: cacheKey)
                }
            }
        } catch is CancellationError {
        } catch {
            guard self.track?.key == key else { return }
            translationError = error.localizedDescription
        }
    }

    private func apply(_ r: TranslateResponse, cacheKey: String) {
        translations.merge(r.translations) { _, new in new }
        if let s = r.sourceLanguage { sourceLanguage = s }
        TranslationCache.save(cacheKey, .init(map: translations, src: sourceLanguage))
    }

    private func romanizeIfNeeded() async {
        guard showPronunciation, config?.pronunciation == true, let track, !lines.isEmpty else {
            if !showPronunciation { pronunciations = [:] }
            return
        }
        let cacheKey = "rom2.\(track.key)"
        pronunciations = TranslationCache.load(cacheKey)?.map ?? [:]
        var seen = Set<String>()
        let missing = lines.map { $0.text.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && Self.needsRomanization($0) && pronunciations[$0] == nil && seen.insert($0).inserted }
        guard !missing.isEmpty else { return }

        let lyrics = lines.map(\.text).joined(separator: "\n")
        let key = track.key
        do {
            for start in stride(from: 0, to: missing.count, by: 20) {
                let chunk = Array(missing[start..<min(start + 20, missing.count)])
                let r = try await VersioAPI.romanize(chunk, title: track.name, artist: track.artistLine, lyrics: lyrics)
                guard !Task.isCancelled, self.track?.key == key else { return }
                pronunciations.merge(r.romanizations) { _, new in new }
                TranslationCache.save(cacheKey, .init(map: pronunciations, src: nil))
            }
        } catch {
            if self.track?.key == key, translationError == nil { translationError = error.localizedDescription }
        }
    }

    static func needsRomanization(_ text: String) -> Bool {
        text.range(of: "[^\\p{Latin}\\p{Common}\\p{Inherited}]", options: .regularExpression) != nil
    }

    // MARK: Colors

    static func averageColor(_ image: UIImage) -> UIColor? {
        guard let ci = CIImage(image: image),
              let filter = CIFilter(name: "CIAreaAverage", parameters: [kCIInputImageKey: ci, kCIInputExtentKey: CIVector(cgRect: ci.extent)]),
              let out = filter.outputImage else { return nil }
        var px = [UInt8](repeating: 0, count: 4)
        CIContext(options: [.workingColorSpace: NSNull()])
            .render(out, toBitmap: &px, rowBytes: 4, bounds: CGRect(x: 0, y: 0, width: 1, height: 1), format: .RGBA8, colorSpace: nil)
        var r = CGFloat(px[0]) / 255, g = CGFloat(px[1]) / 255, b = CGFloat(px[2]) / 255
        // keep it dark enough behind white text
        let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if lum > 0.55 {
            let k = 0.55 / lum
            r *= k; g *= k; b *= k
        }
        return UIColor(red: r, green: g, blue: b, alpha: 1)
    }

    static func mix(_ a: UIColor, with b: UIColor, amount: CGFloat) -> UIColor {
        var (r1, g1, b1, a1): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        var (r2, g2, b2, a2): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        a.getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        b.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        return UIColor(red: r1 + (r2 - r1) * amount, green: g1 + (g2 - g1) * amount, blue: b1 + (b2 - b1) * amount, alpha: 1)
    }
}

/// Small on-device cache so songs you've heard are never translated twice.
enum TranslationCache {
    struct Entry: Codable {
        var map: [String: String]
        var src: String?
    }

    private static let indexKey = "versio.cache.index"
    private static let maxEntries = 300

    static func load(_ key: String) -> Entry? {
        guard let data = UserDefaults.standard.data(forKey: "versio.cache." + key) else { return nil }
        return try? JSONDecoder().decode(Entry.self, from: data)
    }

    static func save(_ key: String, _ entry: Entry) {
        let d = UserDefaults.standard
        guard let data = try? JSONEncoder().encode(entry) else { return }
        d.set(data, forKey: "versio.cache." + key)
        var index = d.stringArray(forKey: indexKey) ?? []
        index.removeAll { $0 == key }
        index.append(key)
        while index.count > maxEntries {
            d.removeObject(forKey: "versio.cache." + index.removeFirst())
        }
        d.set(index, forKey: indexKey)
    }
}
