import Foundation

/// Swift port of lib/lyrics/align.ts — finds lyric lines inside a transcribed
/// clip and derives the timing offset. Keep both in sync.
enum LyricAligner {
    struct Match {
        let index: Int
        /// offset (ms) that would make this line start exactly when it was heard
        let offsetMs: Double
        let score: Double
    }

    static func isCJK(_ s: String) -> Bool {
        s.unicodeScalars.contains { u in
            let v = u.value
            return (0x3040...0x30FF).contains(v) || (0x3400...0x9FFF).contains(v) || (0xAC00...0xD7AF).contains(v) || (0xF900...0xFAFF).contains(v)
        }
    }

    /// Lower-cased, accent- and punctuation-free tokens; CJK splits per character.
    static func tokens(_ text: String) -> [String] {
        let folded = text.folding(options: [.diacriticInsensitive, .caseInsensitive, .widthInsensitive], locale: nil).lowercased()
        var cleaned = String.UnicodeScalarView()
        for u in folded.unicodeScalars {
            cleaned.append(CharacterSet.alphanumerics.contains(u) ? u : " ")
        }
        var out: [String] = []
        for w in String(cleaned).split(separator: " ") {
            let word = String(w)
            if isCJK(word) { out.append(contentsOf: word.map { String($0) }) } else { out.append(word) }
        }
        return out
    }

    private static func bigrams(_ s: String) -> [String: Int] {
        let t = Array(" \(s) ")
        var m: [String: Int] = [:]
        guard t.count > 1 else { return m }
        for i in 0..<(t.count - 1) { m[String(t[i...i + 1]), default: 0] += 1 }
        return m
    }

    /// Sørensen–Dice similarity on character bigrams (0…1).
    static func similarity(_ a: String, _ b: String) -> Double {
        if a.isEmpty || b.isEmpty { return 0 }
        if a == b { return 1 }
        let A = bigrams(a), B = bigrams(b)
        var inter = 0, total = 0
        for (g, n) in A {
            inter += min(n, B[g] ?? 0)
            total += n
        }
        total += B.values.reduce(0, +)
        return total == 0 ? 0 : Double(2 * inter) / Double(total)
    }

    static func align(lines: [LyricLine], heard: [VersioAPI.HeardWord], songMsAt: (Double) -> Double, currentOffsetMs: Double = 0, minScore: Double = 0.72) -> (offsetMs: Double, matches: [Match])? {
        var ht: [(t: String, start: Double)] = []
        for w in heard { for t in tokens(w.word) { ht.append((t, w.start)) } }
        guard ht.count >= 2 else { return nil }

        var candidates: [Match] = []
        for (index, line) in lines.enumerated() {
            guard let time = line.timeMs else { continue }
            let lt = tokens(line.text)
            let cjk = !lt.isEmpty && isCJK(lt[0])
            let k = min(cjk ? 6 : 4, lt.count)
            let probe = lt.prefix(k).joined(separator: " ")
            // too short to identify a line reliably ("oh", "yeah")
            if k < (cjk ? 3 : 2) || probe.count < 6 { continue }
            var best = 0.0, at = -1
            for j in 0..<ht.count {
                for len in [k - 1, k, k + 1] where len >= 1 && j + len <= ht.count {
                    let sc = similarity(probe, ht[j..<(j + len)].map { $0.t }.joined(separator: " "))
                    if sc > best { best = sc; at = j }
                }
            }
            if best >= minScore, at >= 0 {
                candidates.append(Match(index: index, offsetMs: (Double(time) - songMsAt(ht[at].start)).rounded(), score: best))
            }
        }
        guard !candidates.isEmpty else { return nil }

        let agreeMs = 1200.0
        var bestCluster: [Match] = []
        var bestWeight = -1.0, bestDist = Double.infinity
        for c in candidates {
            let cluster = candidates.filter { abs($0.offsetMs - c.offsetMs) <= agreeMs }
            let weight = cluster.reduce(0) { $0 + $1.score }
            let dist = abs(c.offsetMs - currentOffsetMs)
            if weight > bestWeight + 1e-9 || (abs(weight - bestWeight) <= 1e-9 && dist < bestDist) {
                bestCluster = cluster
                bestWeight = weight
                bestDist = dist
            }
        }
        // a single, merely-plausible match is too weak to trust
        if bestCluster.count == 1 && bestCluster[0].score < 0.85 { return nil }

        let offs = bestCluster.map(\.offsetMs).sorted()
        let mid = offs.count / 2
        let median = offs.count % 2 == 1 ? offs[mid] : (offs[mid - 1] + offs[mid]) / 2
        return ((median / 10).rounded() * 10, bestCluster.sorted { $0.index < $1.index })
    }
}
