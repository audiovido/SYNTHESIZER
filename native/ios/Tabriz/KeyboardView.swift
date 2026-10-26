// Tabriz iOS — multitouch piano keyboard (UIKit, so every finger is tracked).
import SwiftUI
import UIKit

final class KeyboardUIView: UIView {
    var lowNote = 48 { didSet { if lowNote != oldValue { releaseAll(); setNeedsDisplay() } } }
    let whiteCount = 15  // two octaves + top C
    var onDown: ((Int, Double) -> Void)?
    var onUp: ((Int) -> Void)?

    private var touchNotes: [ObjectIdentifier: Int] = [:]
    private var pressed: [Int: Int] = [:]
    private static let whiteSteps = [0, 2, 4, 5, 7, 9, 11]
    private static let hasBlack = [true, true, false, true, true, true, false]

    override init(frame: CGRect) {
        super.init(frame: frame)
        isMultipleTouchEnabled = true
        isOpaque = true
        backgroundColor = UIColor(red: 0.08, green: 0.06, blue: 0.05, alpha: 1)
        contentMode = .redraw
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    private var whiteWidth: CGFloat { bounds.width / CGFloat(whiteCount) }

    private func whiteMidi(_ w: Int) -> Int { lowNote + Self.whiteSteps[w % 7] + 12 * (w / 7) }

    private func blackRect(_ w: Int) -> CGRect? {
        guard Self.hasBlack[w % 7], w < whiteCount - 1 else { return nil }
        let ww = whiteWidth
        return CGRect(x: CGFloat(w + 1) * ww - ww * 0.3, y: 0, width: ww * 0.6, height: bounds.height * 0.6)
    }

    private func keyAt(_ p: CGPoint) -> Int? {
        guard bounds.contains(p) else { return nil }
        for w in 0..<whiteCount { if let r = blackRect(w), r.contains(p) { return whiteMidi(w) + 1 } }
        let w = Int(p.x / whiteWidth)
        return w >= 0 && w < whiteCount ? whiteMidi(w) : nil
    }

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        let ww = whiteWidth
        let h = bounds.height
        let accent = UIColor(red: 0.95, green: 0.55, blue: 0.2, alpha: 1)
        for w in 0..<whiteCount {
            let r = CGRect(x: CGFloat(w) * ww + 1, y: 0, width: ww - 2, height: h - 1)
            let midi = whiteMidi(w)
            ctx.setFillColor((pressed[midi] ?? 0) > 0 ? accent.cgColor : UIColor(white: 0.96, alpha: 1).cgColor)
            ctx.addPath(UIBezierPath(roundedRect: r, byRoundingCorners: [.bottomLeft, .bottomRight],
                                     cornerRadii: CGSize(width: 5, height: 5)).cgPath)
            ctx.fillPath()
            if midi % 12 == 0 {
                let label = "C\(midi / 12 - 1)" as NSString
                let attrs: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 11, weight: .semibold),
                                                            .foregroundColor: UIColor(white: 0.45, alpha: 1)]
                label.draw(at: CGPoint(x: r.minX + 4, y: h - 18), withAttributes: attrs)
            }
        }
        for w in 0..<whiteCount {
            guard let r = blackRect(w) else { continue }
            let midi = whiteMidi(w) + 1
            ctx.setFillColor((pressed[midi] ?? 0) > 0 ? accent.cgColor : UIColor(white: 0.1, alpha: 1).cgColor)
            ctx.addPath(UIBezierPath(roundedRect: r, byRoundingCorners: [.bottomLeft, .bottomRight],
                                     cornerRadii: CGSize(width: 3, height: 3)).cgPath)
            ctx.fillPath()
        }
    }

    private func press(_ midi: Int, velocity: Double) {
        pressed[midi, default: 0] += 1
        if pressed[midi] == 1 { onDown?(midi, velocity) }
        setNeedsDisplay()
    }

    private func release(_ midi: Int) {
        guard let n = pressed[midi] else { return }
        if n <= 1 { pressed[midi] = nil; onUp?(midi) } else { pressed[midi] = n - 1 }
        setNeedsDisplay()
    }

    func releaseAll() {
        for (midi, _) in pressed { onUp?(midi) }
        pressed.removeAll()
        touchNotes.removeAll()
        setNeedsDisplay()
    }

    /// Lower on the key = louder, like a real key.
    private func velocity(_ p: CGPoint) -> Double { 0.5 + 0.5 * Double(min(1, max(0, p.y / max(1, bounds.height)))) }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches {
            let p = t.location(in: self)
            if let n = keyAt(p) { touchNotes[ObjectIdentifier(t)] = n; press(n, velocity: velocity(p)) }
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches {
            let id = ObjectIdentifier(t)
            let p = t.location(in: self)
            let new = keyAt(p)
            let old = touchNotes[id]
            guard new != old else { continue }
            if let o = old { release(o) }
            if let n = new { touchNotes[id] = n; press(n, velocity: velocity(p)) } else { touchNotes[id] = nil }
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) { end(touches) }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { end(touches) }

    private func end(_ touches: Set<UITouch>) {
        for t in touches {
            let id = ObjectIdentifier(t)
            if let n = touchNotes[id] { release(n) }
            touchNotes[id] = nil
        }
    }
}

struct KeyboardView: UIViewRepresentable {
    let lowNote: Int
    let onDown: (Int, Double) -> Void
    let onUp: (Int) -> Void

    func makeUIView(context: Context) -> KeyboardUIView {
        let v = KeyboardUIView(frame: .zero)
        v.onDown = onDown
        v.onUp = onUp
        v.lowNote = lowNote
        return v
    }

    func updateUIView(_ v: KeyboardUIView, context: Context) {
        v.onDown = onDown
        v.onUp = onUp
        v.lowNote = lowNote
    }
}
