import SwiftUI

struct SettingsView: View {
    let model: PlayerModel
    let isAdmin: Bool

    @Environment(SpotifyAuth.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @AppStorage("targetLang") private var targetLang = "de"
    @AppStorage("displayMode") private var displayModeRaw = DisplayMode.both.rawValue
    @AppStorage("showPronunciation") private var showPronunciation = false
    @AppStorage("offsetMs") private var offsetMs = 0.0

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
                            Text("Timing offset")
                            Spacer()
                            Text(offsetMs == 0 ? "none" : String(format: "%+.2f s", offsetMs / 1000))
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }
                        Slider(value: $offsetMs, in: -2000...2000, step: 50)
                            .tint(.white)
                    }
                    if offsetMs != 0 {
                        Button("Reset offset") { offsetMs = 0 }
                    }
                } footer: {
                    Text("Positive shows lyrics earlier — useful with Bluetooth headphones.")
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
