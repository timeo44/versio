import SwiftUI

struct LyricLineView: View {
    let line: LyricLine
    /// 0 = the line being sung, ±1 neighbours, … (0 for unsynced lyrics)
    let distance: Int
    let synced: Bool
    let browsing: Bool
    let translation: String?
    let pronunciation: String?
    let pending: Bool
    let mode: DisplayMode
    let accentText: Color

    private var isGap: Bool { line.text.trimmingCharacters(in: .whitespaces).isEmpty }
    private var active: Bool { synced && distance == 0 }

    private var opacity: Double {
        guard synced else { return 0.92 }
        if active { return 1 }
        if abs(distance) == 1 { return browsing ? 0.6 : 0.42 }
        return browsing ? 0.5 : (distance < 0 ? 0.16 : 0.22)
    }

    private var scale: CGFloat { !synced || active ? 1 : (abs(distance) == 1 ? 0.93 : 0.9) }

    var body: some View {
        Group {
            if isGap {
                gap
            } else {
                content
            }
        }
        .opacity(opacity)
        .scaleEffect(scale, anchor: .leading)
        .animation(.spring(response: 0.55, dampingFraction: 0.9), value: distance)
    }

    private var gap: some View {
        HStack(spacing: 8) {
            ForEach(0..<3, id: \.self) { _ in
                Circle().fill(.white).frame(width: 9, height: 9)
            }
        }
        .frame(height: synced ? 44 : 14, alignment: .leading)
        .opacity(synced ? 1 : 0)
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 5) {
            let translationIsMain = mode == .translation && translation != nil
            if !translationIsMain {
                Text(line.text)
                    .font(.system(size: 26, weight: .bold))
                    .tracking(-0.4)
                    .foregroundStyle(mode == .translation ? Color.white.opacity(0.5) : Color.white)
                    .multilineTextAlignment(.leading)
                if let pronunciation {
                    Text(pronunciation)
                        .font(.system(size: 15))
                        .foregroundStyle(.white.opacity(0.55))
                }
            }
            if mode != .original {
                if let translation {
                    Text(translation)
                        .font(translationIsMain ? .system(size: 26, weight: .bold) : .system(size: 18, weight: .medium))
                        .foregroundStyle(translationIsMain ? Color.white : accentText)
                        .padding(.top, translationIsMain ? 0 : 1)
                } else if pending {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(.white.opacity(0.08))
                        .frame(width: 200, height: 20)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 10)
    }
}
