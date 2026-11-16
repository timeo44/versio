import SwiftUI

/// Two ways to fix lyrics timing for the current device:
/// tap the moment a line starts, or let the app listen through the mic.
struct CalibrationView: View {
    let model: PlayerModel

    @Environment(\.dismiss) private var dismiss
    @State private var target: Int?
    @State private var status: String?
    @State private var listening = false
    @State private var recorder = ListenRecorder()

    /// next non-empty line after the one the app thinks is playing
    private var upcoming: Int? {
        let lines = model.lines
        var i = max(0, model.activeIndex + 1)
        while lines.indices.contains(i) {
            if !lines[i].text.trimmingCharacters(in: .whitespaces).isEmpty { return i }
            i += 1
        }
        return nil
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    HStack {
                        Text("Current offset")
                        Spacer()
                        Text(String(format: "%+.2f s", model.offsetMs / 1000)).monospacedDigit().foregroundStyle(.secondary)
                    }
                    .font(.system(size: 15))

                    // Tap
                    VStack(alignment: .leading, spacing: 12) {
                        Text("TAP").font(.system(size: 11, weight: .semibold)).tracking(1.2).foregroundStyle(.white.opacity(0.4))
                        if let t = target, model.lines.indices.contains(t) {
                            Text("Tap the button the moment you hear:")
                                .font(.system(size: 14)).foregroundStyle(.white.opacity(0.6))
                            Text(model.lines[t].text).font(.system(size: 22, weight: .bold))
                            Button {
                                model.calibrate(tappedLine: t, at: Date())
                                Haptics.success()
                                status = String(format: "Offset set to %+.2f s for %@.", model.offsetMs / 1000, model.deviceName ?? "this device")
                                target = nil
                            } label: {
                                Text("Now!")
                                    .font(.system(size: 20, weight: .bold))
                                    .foregroundStyle(.black)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 18)
                                    .background(.white, in: RoundedRectangle(cornerRadius: 16))
                            }
                            .buttonStyle(PressStyle())
                        } else {
                            Button("Pick the next line") { target = upcoming }
                                .buttonStyle(PillStyle(primary: true))
                                .disabled(upcoming == nil || model.phase != .playing)
                            Text("Shows the next line — tap when it starts being sung. Works with headphones too.")
                                .font(.system(size: 13)).foregroundStyle(.white.opacity(0.5))
                        }
                    }

                    // Listen
                    VStack(alignment: .leading, spacing: 12) {
                        Text("LISTEN").font(.system(size: 11, weight: .semibold)).tracking(1.2).foregroundStyle(.white.opacity(0.4))
                        Button {
                            Task { await listen() }
                        } label: {
                            Label(listening ? "Listening… (\(Int(ListenRecorder.seconds)) s)" : "Listen through the microphone", systemImage: "mic")
                        }
                        .buttonStyle(PillStyle(primary: false))
                        .disabled(listening || model.phase != .playing || model.config?.listen == false)
                        Text("Play the song out loud (speaker, not only headphones) during a part with vocals. The clip is transcribed once and not stored.")
                            .font(.system(size: 13)).foregroundStyle(.white.opacity(0.5))
                    }

                    if let status {
                        Text(status).font(.system(size: 14, weight: .medium)).foregroundStyle(Color.spotify)
                    }
                }
                .padding(22)
            }
            .navigationTitle("Calibrate timing")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .onDisappear { recorder.cancel() }
        }
    }

    private func listen() async {
        listening = true
        status = nil
        defer { listening = false }
        do {
            let r = try await model.calibrateByListening(recorder: recorder)
            Haptics.success()
            status = String(format: "Offset set to %+.2f s (%d lines recognised).", r.offsetMs / 1000, r.matched)
        } catch {
            status = error.localizedDescription
        }
    }
}
