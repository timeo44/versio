import SwiftUI

struct ExplainItem: Identifiable {
    let id = UUID()
    let line: String
    let pronunciation: String?
    let translation: String?
    let previous: String?
    let next: String?
}

struct PlayerView: View {
    let isAdmin: Bool

    @State private var model = PlayerModel()
    @AppStorage("targetLang") private var targetLang = "de"
    @AppStorage("displayMode") private var displayModeRaw = DisplayMode.both.rawValue
    @AppStorage("showPronunciation") private var showPronunciation = false
    @AppStorage("offsetMs") private var offsetMs = 0.0

    @State private var follow = true
    @State private var showSettings = false
    @State private var explain: ExplainItem?
    @Environment(\.scenePhase) private var scenePhase

    private var mode: DisplayMode { DisplayMode(rawValue: displayModeRaw) ?? .both }

    var body: some View {
        ZStack {
            background
            VStack(spacing: 0) {
                topBar
                if let track = model.track {
                    nowPlaying(track)
                    modePicker
                    banners
                    lyricsArea
                } else {
                    emptyState
                }
            }
        }
        .onAppear {
            model.target = targetLang
            model.showPronunciation = showPronunciation
            model.offsetMs = offsetMs
            model.start()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.start() } else if phase == .background { model.stop() }
        }
        .onChange(of: targetLang) { _, v in
            model.target = v
            model.retranslate()
        }
        .onChange(of: showPronunciation) { _, v in
            model.showPronunciation = v
            model.retranslate()
        }
        .onChange(of: offsetMs) { _, v in model.offsetMs = v }
        .onChange(of: model.track?.key) { _, _ in follow = true }
        .sheet(isPresented: $showSettings) {
            SettingsView(model: model, isAdmin: isAdmin)
                .presentationDetents([.large])
                .presentationBackground(.ultraThinMaterial)
        }
        .sheet(item: $explain) { item in
            ExplainSheet(item: item, target: targetLang, model: model)
                .presentationDetents([.medium, .large])
                .presentationBackground(.ultraThinMaterial)
        }
    }

    // MARK: Background

    private var background: some View {
        ZStack {
            Color.ink
            Circle()
                .fill(model.accent)
                .frame(width: 520, height: 520)
                .blur(radius: 140)
                .opacity(model.track == nil ? 0.15 : 0.55)
                .offset(x: -120, y: -320)
            Circle()
                .fill(model.accent)
                .frame(width: 420, height: 420)
                .blur(radius: 160)
                .opacity(model.track == nil ? 0.08 : 0.3)
                .offset(x: 160, y: 420)
        }
        .ignoresSafeArea()
        .animation(.easeInOut(duration: 1.2), value: model.accent)
    }

    // MARK: Top bar

    private var topBar: some View {
        HStack(spacing: 10) {
            LogoMark(size: 28)
            Text("Versio").font(.system(size: 17, weight: .semibold))
            Circle()
                .fill(statusColor)
                .frame(width: 7, height: 7)
            Spacer()
            Menu {
                Picker("Translate to", selection: $targetLang) {
                    ForEach(Language.all) { Text($0.name).tag($0.code) }
                }
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "globe")
                    Text(targetLang.uppercased()).font(.system(size: 14, weight: .semibold))
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.white.opacity(0.07), in: Capsule())
                .overlay(Capsule().stroke(.white.opacity(0.1)))
            }
            Button {
                showSettings = true
            } label: {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 17, weight: .medium))
                    .frame(width: 38, height: 38)
            }
            .buttonStyle(PressStyle())
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 18)
        .padding(.top, 6)
        .padding(.bottom, 10)
    }

    private var statusColor: Color {
        switch model.phase {
        case .playing: return .spotify
        case .paused: return .white.opacity(0.5)
        case .error: return .orange
        default: return .spotify.opacity(0.5)
        }
    }

    // MARK: Now playing

    private func nowPlaying(_ track: SpotifyTrack) -> some View {
        HStack(spacing: 14) {
            Group {
                if let img = model.artwork {
                    Image(uiImage: img).resizable().scaledToFill()
                } else {
                    Color.white.opacity(0.06)
                }
            }
            .frame(width: 58, height: 58)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(track.name).font(.system(size: 16, weight: .semibold)).lineLimit(1)
                    if model.phase == .paused {
                        Image(systemName: "pause.fill").font(.system(size: 10)).foregroundStyle(.white.opacity(0.5))
                    }
                }
                Text("\(track.artistLine) · \(track.album.name)")
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.55))
                    .lineLimit(1)
                TimelineView(.periodic(from: .now, by: 0.5)) { ctx in
                    let pos = model.position(at: ctx.date, includeOffset: false)
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(.white.opacity(0.12))
                            Capsule().fill(.white)
                                .frame(width: geo.size.width * min(1, pos / Double(max(1, track.durationMs))))
                        }
                    }
                    .frame(height: 3)
                }
                .padding(.top, 6)
            }
        }
        .padding(10)
        .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(.white.opacity(0.06)))
        .padding(.horizontal, 16)
    }

    private var modePicker: some View {
        Picker("Display", selection: $displayModeRaw) {
            ForEach(DisplayMode.allCases) { Text($0.label).tag($0.rawValue) }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    @ViewBuilder
    private var banners: some View {
        VStack(spacing: 6) {
            if model.rateLimited { Banner(text: "Spotify is rate-limiting — sync resumes in a moment.") }
            if case .idle(let msg) = model.phase { Banner(text: msg) }
            if let err = model.translationError { Banner(text: err, tone: .orange) }
            if case .ready(let kind) = model.lyricsState, kind == "plain" {
                Banner(text: "Unsynced lyrics — no timing data exists for this song.")
            }
            if model.sameLanguage { Banner(text: "Already in \(Language.name(for: targetLang)).") }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    // MARK: Lyrics

    @ViewBuilder
    private var lyricsArea: some View {
        switch model.lyricsState {
        case .idle, .loading:
            VStack(alignment: .leading, spacing: 18) {
                ForEach(0..<3, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 8)
                        .fill(.white.opacity(0.07 - Double(i) * 0.015))
                        .frame(width: CGFloat([280, 220, 250][i]), height: 30)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(.horizontal, 22)
            .padding(.top, 120)
        case .error(let msg):
            centered(title: "Couldn't load lyrics", body: msg)
        case .ready(let kind) where kind == "instrumental":
            centered(title: "Instrumental", body: "No vocals in this one — just listen.")
        case .ready(let kind) where kind == "not_found" || model.lines.isEmpty:
            centered(title: "No lyrics found", body: "LRCLIB has no lyrics for this song yet. You can add synced lyrics at lrclib.net.")
        case .ready:
            lyricsList
        }
    }

    private var lyricsList: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 2) {
                    Color.clear.frame(height: model.synced ? 160 : 12)
                    ForEach(Array(model.lines.enumerated()), id: \.element.id) { index, line in
                        let text = line.text.trimmingCharacters(in: .whitespaces)
                        LyricLineView(
                            line: line,
                            distance: model.synced && model.activeIndex >= 0 ? index - model.activeIndex : (model.synced ? index + 1 : 0),
                            synced: model.synced,
                            browsing: !follow,
                            translation: mode == .original || model.sameLanguage ? nil : model.translations[text],
                            pronunciation: showPronunciation ? model.pronunciations[text] : nil,
                            pending: mode != .original && model.translating && !text.isEmpty && model.translations[text] == nil,
                            mode: model.sameLanguage ? .original : mode,
                            accentText: model.accentText
                        )
                        .id(line.id)
                        .contentShape(Rectangle())
                        .onTapGesture { openExplanation(index) }
                    }
                    Color.clear.frame(height: 420)
                }
                .padding(.horizontal, 22)
            }
            .simultaneousGesture(DragGesture(minimumDistance: 8).onChanged { _ in
                if model.synced { follow = false }
            })
            .mask(
                LinearGradient(stops: [
                    .init(color: .clear, location: 0),
                    .init(color: .black, location: 0.1),
                    .init(color: .black, location: 0.82),
                    .init(color: .clear, location: 1),
                ], startPoint: .top, endPoint: .bottom)
            )
            .onChange(of: model.activeIndex) { _, idx in
                guard follow else { return }
                scroll(proxy, to: idx)
            }
            .onChange(of: displayModeRaw) { _, _ in
                if follow { scroll(proxy, to: model.activeIndex, animated: false) }
            }
            .overlay(alignment: .bottom) {
                if model.synced && !follow {
                    Button {
                        follow = true
                        scroll(proxy, to: model.activeIndex)
                    } label: {
                        Label("Follow live", systemImage: "arrow.down")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.black)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(.white, in: Capsule())
                            .shadow(color: .black.opacity(0.4), radius: 12, y: 4)
                    }
                    .buttonStyle(PressStyle())
                    .padding(.bottom, 18)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.easeOut(duration: 0.25), value: follow)
        }
    }

    private func scroll(_ proxy: ScrollViewProxy, to index: Int, animated: Bool = true) {
        guard model.lines.indices.contains(index) else { return }
        let id = model.lines[index].id
        if animated {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.9)) { proxy.scrollTo(id, anchor: UnitPoint(x: 0, y: 0.32)) }
        } else {
            proxy.scrollTo(id, anchor: UnitPoint(x: 0, y: 0.32))
        }
    }

    private func openExplanation(_ index: Int) {
        let lines = model.lines
        guard lines.indices.contains(index) else { return }
        let text = lines[index].text.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        func neighbour(_ step: Int) -> String? {
            var j = index + step
            while lines.indices.contains(j) {
                let t = lines[j].text.trimmingCharacters(in: .whitespaces)
                if !t.isEmpty { return t }
                j += step
            }
            return nil
        }
        explain = ExplainItem(line: text, pronunciation: model.pronunciations[text], translation: model.translations[text], previous: neighbour(-1), next: neighbour(1))
    }

    // MARK: Empty states

    @ViewBuilder
    private var emptyState: some View {
        switch model.phase {
        case .loading:
            centered(title: "Checking what's playing…", body: nil)
        case .error(let msg):
            centered(title: "Can't reach Spotify", body: msg)
        case .idle(let msg):
            VStack(spacing: 14) {
                Image(systemName: "music.note")
                    .font(.system(size: 26))
                    .foregroundStyle(Color.spotify)
                    .frame(width: 58, height: 58)
                    .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 16))
                Text("Play something on Spotify").font(.system(size: 21, weight: .bold))
                Text(msg).font(.system(size: 15)).foregroundStyle(.white.opacity(0.55)).multilineTextAlignment(.center)
                Link("Open Spotify", destination: URL(string: "spotify://")!)
                    .buttonStyle(PillStyle(primary: false))
                    .padding(.top, 6)
            }
            .padding(.horizontal, 32)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        default:
            Spacer()
        }
    }

    private func centered(title: String, body: String?) -> some View {
        VStack(spacing: 8) {
            Text(title).font(.system(size: 19, weight: .semibold))
            if let body {
                Text(body).font(.system(size: 14)).foregroundStyle(.white.opacity(0.55)).multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct Banner: View {
    let text: String
    var tone: Color = .white

    var body: some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundStyle(tone == .white ? .white.opacity(0.75) : tone.opacity(0.95))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(tone.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(tone.opacity(0.15)))
    }
}
