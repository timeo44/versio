import SwiftUI

struct ExplainSheet: View {
    let item: ExplainItem
    let target: String
    let model: PlayerModel

    @State private var explanation: Explanation?
    @State private var error: String?
    @State private var loading = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(item.line).font(.system(size: 22, weight: .bold))
                    if let p = item.pronunciation {
                        Text(p).font(.system(size: 15)).foregroundStyle(.white.opacity(0.55))
                    }
                    if let t = item.translation {
                        Text(t).font(.system(size: 17, weight: .medium)).foregroundStyle(model.accentText)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
                .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 18))

                if loading {
                    ProgressView().tint(.white).frame(maxWidth: .infinity)
                } else if let error {
                    Text(error).font(.system(size: 14)).foregroundStyle(.orange)
                    Button("Try again") { Task { await load() } }
                        .buttonStyle(PillStyle(primary: false))
                } else if let e = explanation {
                    section("Natural translation", e.natural)
                    section("Literal meaning", e.literal)
                    if !e.slang.isEmpty { terms("Slang & idioms", e.slang) }
                    if !e.cultural.isEmpty { section("Cultural context", e.cultural) }
                    if !e.vocabulary.isEmpty { terms("Vocabulary", e.vocabulary) }
                }
            }
            .padding(22)
        }
        .task { await load() }
    }

    private func load() async {
        guard let track = model.track else { return }
        loading = true
        error = nil
        do {
            explanation = try await VersioAPI.explain(
                line: item.line, translation: item.translation, previous: item.previous, next: item.next,
                target: target, title: track.name, artist: track.artistLine)
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func section(_ title: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(.white.opacity(0.4))
            Text(text).font(.system(size: 16)).foregroundStyle(.white.opacity(0.9))
        }
    }

    private func terms(_ title: String, _ items: [Explanation.Term]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(.white.opacity(0.4))
            ForEach(items, id: \.self) { t in
                VStack(alignment: .leading, spacing: 2) {
                    Text(t.term).font(.system(size: 16, weight: .semibold))
                    Text(t.meaning).font(.system(size: 14)).foregroundStyle(.white.opacity(0.6))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
            }
        }
    }
}
