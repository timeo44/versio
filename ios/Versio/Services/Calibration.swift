import AVFoundation
import Foundation

/// Timing offset per Spotify device (phone speaker, AirPods via Mac, car …).
/// A new device starts at 0. Mirrors the web app's per-device offsets.
struct DeviceOffset: Codable, Identifiable {
    let key: String
    var name: String
    var type: String
    var offsetMs: Double
    var updatedAt: Date
    var id: String { key }
}

enum DeviceOffsets {
    private static let storeKey = "versio.deviceOffsets"
    static let maxOffsetMs = 15_000.0
    private static let maxDevices = 12

    static func key(name: String, type: String?) -> String {
        "\(type ?? "device")::\(name)".lowercased()
    }

    static func all() -> [DeviceOffset] {
        guard let data = UserDefaults.standard.data(forKey: storeKey),
              let list = try? JSONDecoder().decode([DeviceOffset].self, from: data) else { return [] }
        return list.sorted { $0.updatedAt > $1.updatedAt }
    }

    static func offset(for key: String) -> Double {
        all().first { $0.key == key }?.offsetMs ?? 0
    }

    static func set(_ offsetMs: Double, key: String, name: String, type: String?) {
        var list = all().filter { $0.key != key }
        let clamped = min(maxOffsetMs, max(-maxOffsetMs, (offsetMs / 10).rounded() * 10))
        list.insert(DeviceOffset(key: key, name: name, type: type ?? "device", offsetMs: clamped, updatedAt: Date()), at: 0)
        save(Array(list.prefix(maxDevices)))
    }

    static func remove(_ key: String) {
        save(all().filter { $0.key != key })
    }

    private static func save(_ list: [DeviceOffset]) {
        if let data = try? JSONEncoder().encode(list) { UserDefaults.standard.set(data, forKey: storeKey) }
    }
}

enum CalibrationError: LocalizedError {
    case micDenied, recordingFailed, nothingMatched

    var errorDescription: String? {
        switch self {
        case .micDenied: return "Microphone access is off. Enable it in Settings → Versio."
        case .recordingFailed: return "Couldn't record audio."
        case .nothingMatched: return "Couldn't recognise the lyrics. Play the song out loud (not only in headphones) and try again during a part with vocals."
        }
    }
}

/// Records a short clip through the microphone while the song plays out loud.
final class ListenRecorder: NSObject {
    static let seconds: TimeInterval = 8
    private var recorder: AVAudioRecorder?
    private let url = FileManager.default.temporaryDirectory.appendingPathComponent("versio-listen.m4a")

    /// Returns the clip and the moment recording started.
    func record() async throws -> (data: Data, startedAt: Date) {
        guard await AVAudioApplication.requestRecordPermission() else { throw CalibrationError.micDenied }

        let session = AVAudioSession.sharedInstance()
        // mixWithOthers: don't stop Spotify playing on this phone
        try session.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .defaultToSpeaker, .allowBluetoothA2DP])
        try session.setActive(true)
        defer { try? session.setActive(false, options: .notifyOthersOnDeactivation) }

        try? FileManager.default.removeItem(at: url)
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 22_050,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 48_000,
        ]
        let rec = try AVAudioRecorder(url: url, settings: settings)
        recorder = rec
        guard rec.prepareToRecord(), rec.record() else { throw CalibrationError.recordingFailed }
        let startedAt = Date()
        try await Task.sleep(for: .seconds(Self.seconds))
        rec.stop()
        recorder = nil
        let data = try Data(contentsOf: url)
        guard !data.isEmpty else { throw CalibrationError.recordingFailed }
        return (data, startedAt)
    }

    func cancel() {
        recorder?.stop()
        recorder = nil
    }
}
