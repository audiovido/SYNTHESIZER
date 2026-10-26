// Tabriz iOS — panel controls in the Tabriz skin (1970s analog monosynth:
// matte black panel, walnut cheeks, cream header bands, aluminum knobs,
// orange switches). Colours follow src/ui/skins.css [data-skin="tabriz"].
import SwiftUI

enum Theme {
    static let page = Color(hex: 0x120d09)
    static let panel = Color(hex: 0x141312)
    static let shellTop = Color(hex: 0x171615)
    static let shellBottom = Color(hex: 0x0f0e0d)
    static let ink = Color(hex: 0xece2c8)
    static let inkDim = Color(hex: 0xb8ac8e)
    static let inkFaint = Color(hex: 0x8f8571)
    static let cream = Color(hex: 0xe8dcc0)
    static let creamHi = Color(hex: 0xefe4c8)
    static let creamLo = Color(hex: 0xddd0ad)
    static let btnTop = Color(hex: 0xf3e9cf)
    static let btnBottom = Color(hex: 0xd9caa2)
    static let btnInk = Color(hex: 0x1d1a14)
    static let accent = Color(hex: 0xf08a3c)
    static let accentHi = Color(hex: 0xffa25a)
    static let accentLo = Color(hex: 0xb8521a)
    static let accentInk = Color(hex: 0x1a0e06)
    static let walnut = [Color(hex: 0x5b3419), Color(hex: 0x6e4121), Color(hex: 0x4f2c14), Color(hex: 0x7a4a26), Color(hex: 0x603819)]
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255, blue: Double(hex & 0xff) / 255)
    }
}

/// Size of the knobs on the current page, chosen by the layout from the space available.
private struct KnobSizeKey: EnvironmentKey { static let defaultValue: CGFloat = 52 }
extension EnvironmentValues {
    var knobSize: CGFloat {
        get { self[KnobSizeKey.self] }
        set { self[KnobSizeKey.self] = newValue }
    }
}

// MARK: - Knob

struct KnobView: View {
    let label: String
    let spec: ParamSpec
    let value: Double
    let small: Bool
    let onChange: (Double) -> Void
    let onReset: () -> Void

    @Environment(\.knobSize) private var baseSize
    @State private var startNorm: Double?
    @State private var dragging = false
    @State private var lastTap: Date?

    init(label: String, spec: ParamSpec, value: Double, small: Bool = false,
         onChange: @escaping (Double) -> Void, onReset: @escaping () -> Void) {
        self.label = label
        self.spec = spec
        self.value = value
        self.small = small
        self.onChange = onChange
        self.onReset = onReset
    }

    var body: some View {
        let size = small ? baseSize * 0.78 : baseSize
        let n = spec.norm(value)
        VStack(spacing: 2) {
            ZStack {
                // arc track + value arc (270 degrees, from 7:30 to 4:30)
                Circle().trim(from: 0, to: 0.75)
                    .stroke(Theme.cream.opacity(0.12), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(135))
                Circle().trim(from: 0, to: max(0.001, 0.75 * n))
                    .stroke(Theme.cream.opacity(0.7), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(135))
                // aluminum cap
                Circle().fill(Color(hex: 0x0a0a0a)).padding(size * 0.1)
                Circle()
                    .fill(RadialGradient(colors: [Color(hex: 0xe9e9e9), Color(hex: 0xc3c3c3), Color(hex: 0x8c8c8c), Color(hex: 0x5f5f5f)],
                                         center: .center, startRadius: 0, endRadius: size * 0.36))
                    .overlay(Circle().fill(RadialGradient(colors: [.white.opacity(0.9), .white.opacity(0)],
                                                          center: UnitPoint(x: 0.36, y: 0.28), startRadius: 0, endRadius: size * 0.16)))
                    .overlay(Circle().stroke(Color(hex: 0x2d2d2d), lineWidth: 1))
                    .padding(size * 0.14)
                    .shadow(color: .black.opacity(0.6), radius: 2, y: 1.5)
                Capsule().fill(Color(hex: 0x111111))
                    .frame(width: max(2, size * 0.05), height: size * 0.22)
                    .offset(y: -size * 0.21)
                    .rotationEffect(.degrees(-135 + 270 * n))
            }
            .frame(width: size, height: size)
            .contentShape(Rectangle())
            // One gesture does both: drag turns the knob, a quick double tap (no movement) resets it.
            // (A separate tap gesture never fires: the drag gesture claims the touch first.)
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { g in
                    if startNorm == nil { startNorm = n }
                    let moved = abs(g.translation.width) + abs(g.translation.height)
                    if moved < 3 && !dragging { return }  // still a tap: leave the value alone
                    dragging = true
                    let delta = (-g.translation.height + g.translation.width * 0.4) / 180
                    onChange(spec.value((startNorm ?? n) + delta))
                }
                .onEnded { _ in
                    let wasTap = !dragging
                    startNorm = nil
                    dragging = false
                    guard wasTap else { lastTap = nil; return }
                    let now = Date()
                    if let t = lastTap, now.timeIntervalSince(t) < 0.35 {
                        lastTap = nil
                        onReset()
                    } else {
                        lastTap = now
                    }
                })
            Text(label)
                .font(.system(size: max(8, size * 0.19), weight: .bold))
                .foregroundColor(Theme.cream)
                .lineLimit(1).minimumScaleFactor(0.7)
            Text(spec.format(value))
                .font(.system(size: max(8, size * 0.18)).monospacedDigit())
                .foregroundColor(Theme.inkDim)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(minWidth: size + 6, maxWidth: .infinity)
    }
}

// MARK: - Choice (waveform, filter mode, LFO target)

struct ChoiceRow: View {
    let options: [ChoiceOption]
    let selected: String
    let onSelect: (String) -> Void
    @Environment(\.knobSize) private var size

    init(options: [ChoiceOption], selected: String, onSelect: @escaping (String) -> Void) {
        self.options = options
        self.selected = selected
        self.onSelect = onSelect
    }

    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.self) { o in
                let on = o.value == selected
                Button { onSelect(o.value) } label: {
                    Text(o.text)
                        .font(.system(size: max(10, size * 0.24), weight: .heavy))
                        .foregroundColor(on ? Theme.accentInk : Theme.btnInk)
                        .lineLimit(1).minimumScaleFactor(0.6)
                        .frame(maxWidth: .infinity, minHeight: max(24, size * 0.5))
                        .background(
                            RoundedRectangle(cornerRadius: 3)
                                .fill(LinearGradient(colors: on ? [Theme.accentHi, Theme.accent, Theme.accentLo] : [Theme.btnTop, Theme.btnBottom],
                                                     startPoint: .top, endPoint: .bottom))
                                .shadow(color: on ? Theme.accent.opacity(0.55) : .black.opacity(0.5), radius: on ? 5 : 1, y: on ? 0 : 2)
                        )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(o.title)
            }
        }
    }
}

// MARK: - Toggles (MONO, LEGATO)

struct ToggleRow: View {
    let items: [ToggleItem]
    let value: (String) -> String
    let onSet: (String, String) -> Void
    @Environment(\.knobSize) private var size

    init(items: [ToggleItem], value: @escaping (String) -> String, onSet: @escaping (String, String) -> Void) {
        self.items = items
        self.value = value
        self.onSet = onSet
    }

    var body: some View {
        HStack(spacing: 6) {
            ForEach(items, id: \.self) { t in
                let on = value(t.key) == t.on
                Button { onSet(t.key, on ? t.off : t.on) } label: {
                    HStack(spacing: 5) {
                        Circle().fill(on ? Theme.accent : Color(hex: 0x3a2214))
                            .overlay(Circle().stroke(Color(hex: 0x5a3a24), lineWidth: 1))
                            .shadow(color: on ? Theme.accent : .clear, radius: 4)
                            .frame(width: 7, height: 7)
                        Text(t.label).font(.system(size: max(10, size * 0.22), weight: .heavy))
                    }
                    .foregroundColor(on ? Theme.accentInk : Theme.btnInk)
                    .frame(maxWidth: .infinity, minHeight: max(24, size * 0.5))
                    .background(
                        RoundedRectangle(cornerRadius: 3)
                            .fill(LinearGradient(colors: on ? [Theme.accentHi, Theme.accent, Theme.accentLo] : [Theme.btnTop, Theme.btnBottom],
                                                 startPoint: .top, endPoint: .bottom))
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Section card (cream header band)

struct SectionCard<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 0) {
            Text(title)
                .font(.system(size: 11, weight: .heavy))
                .tracking(0.8)
                .foregroundColor(Theme.btnInk)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 3)
                .background(LinearGradient(colors: [Theme.creamHi, Theme.creamLo], startPoint: .top, endPoint: .bottom))
            VStack(spacing: 8) { content }
                .padding(.horizontal, 8)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .background(Theme.panel)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.cream, lineWidth: 1))
    }
}

// MARK: - Pitch bend / mod wheel strips

struct WheelStrip: View {
    let label: String
    let springs: Bool          // pitch bend returns to centre
    let onChange: (Double) -> Void
    @State private var pos: Double   // 0..1 (bend: 0.5 = centre)

    init(label: String, springs: Bool, onChange: @escaping (Double) -> Void) {
        self.label = label
        self.springs = springs
        self.onChange = onChange
        _pos = State(initialValue: springs ? 0.5 : 0)
    }

    var body: some View {
        GeometryReader { geo in
            let h = geo.size.height - 22
            ZStack(alignment: .top) {
                RoundedRectangle(cornerRadius: 5)
                    .fill(LinearGradient(colors: [Color(hex: 0x2a1d14), Color(hex: 0x120c08)], startPoint: .top, endPoint: .bottom))
                    .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color.black, lineWidth: 1))
                if springs {
                    Rectangle().fill(Theme.cream.opacity(0.25)).frame(height: 1).offset(y: h * 0.5 + 6)
                }
                RoundedRectangle(cornerRadius: 3)
                    .fill(LinearGradient(colors: [Theme.btnTop, Theme.btnBottom], startPoint: .top, endPoint: .bottom))
                    .frame(height: 24)
                    .padding(.horizontal, 4)
                    .offset(y: CGFloat(1 - pos) * (h - 12))
                    .shadow(color: .black.opacity(0.6), radius: 2, y: 1)
                Text(label).font(.system(size: 9, weight: .heavy)).foregroundColor(Theme.inkFaint)
                    .frame(maxHeight: .infinity, alignment: .bottom).padding(.bottom, 4)
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { g in
                    pos = Double(min(1, max(0, 1 - (g.location.y - 12) / max(1, h - 12))))
                    onChange(springs ? pos * 2 - 1 : pos)
                }
                .onEnded { _ in
                    if springs {
                        withAnimation(.easeOut(duration: 0.15)) { pos = 0.5 }
                        onChange(0)
                    }
                })
        }
        .frame(width: 34)
    }
}
