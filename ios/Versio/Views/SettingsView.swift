import SwiftUI

struct SettingsView: View {
    let model: PlayerModel
    let isAdmin: Bool

    @Environment(SpotifyAuth.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @AppStorage("targetLang") private var targetLang = "de"
    @AppStorage("displayMode") private var displayModeRaw = DisplayMode.both.rawValue
    @AppStorage("showPronunciation") private var showPronunciation = false
    @State private var devices: [DeviceOffset] = []
    @State private var showCalibration = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Lyrics display") {
                    Picker("Show", selection: $displayModeRaw) {
                        ForEach(DisplayMode.allCases) { Text($0.label).tag($0.rawValue) }
                    }
                    Toggle(isOn: $showPronunciation) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Show pronunciation")
                            Text(model.config?.pronunciation == false ? "Needs an OpenAI key on the server." : "Latin-script transliteration for Arabic, Japanese, Korean, Cyrillic …")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .tint(.spotify)
                    .disabled(model.config?.pronunciation == false)
                }

                Section("Translate to") {
                    Picker("Language", selection: $targetLang) {
                        ForEach(Language.all) { Text($0.name).tag($0.code) }
                    }
                    .pickerStyle(.navigationLink)
                }

                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("Offset")
                            Spacer()
                            Text(model.offsetMs == 0 ? "none" : String(format: "%+.2f s", model.offsetMs / 1000))
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }
                        Slider(
                            value: Binding(get: { model.offsetMs }, set: { model.setOffset($0) }),
                            in: -3000...3000,
                            step: 50
                        )
                        .tint(.white)
                    }
                    Button {
                        showCalibration = true
                    } label: {
                        Label("Calibrate (tap or listen)", systemImage: "waveform")
                    }
                    .disabled(!model.synced)
                    if model.offsetMs != 0 {
                        Button("Reset for this device") {
                            model.setOffset(0)
                            devices = DeviceOffsets.all()
                        }
                    }
                } header: {
                    Text("Timing · \(model.deviceName ?? "no active device")")
                } footer: {
                    Text("Saved per Spotify device (phone, speaker, car …) — a new device starts at 0. Positive shows lyrics earlier.")
                }

                if !devices.isEmpty {
                    Section("Saved devices") {
                        ForEach(devices) { d in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(d.name)
                                    Text(d.type.capitalized).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(String(format: "%+.2f s", d.offsetMs / 1000))
                                    .foregroundStyle(.secondary)
                                    .monospacedDigit()
                            }
                        }
                        .onDelete { idx in
                            for i in idx { DeviceOffsets.remove(devices[i].key) }
                            devices = DeviceOffsets.all()
                            model.reloadOffset()
                        }
                    }
                }

                Section("Account") {
                    if isAdmin {
                        Link(destination: Config.webApp) {
                            Label("User management & credits", systemImage: "person.2")
                        }
                    }
                    Link(destination: Config.webApp) {
                        Label("Vocabulary (web)", systemImage: "bookmark")
                    }
                    Button("Disconnect Spotify", role: .destructive) {
                        dismiss()
                        auth.logout()
                    }
                }

                Section {
                    Text("Lyrics are provided by LRCLIB and remain the property of their rights holders. For personal, non-commercial listening only.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .scrollContentBackground(.hidden)
            .onAppear { devices = DeviceOffsets.all() }
            .sheet(isPresented: $showCalibration, onDismiss: { devices = DeviceOffsets.all() }) {
                CalibrationView(model: model)
                    .presentationDetents([.medium, .large])
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
