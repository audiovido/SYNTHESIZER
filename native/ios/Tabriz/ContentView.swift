// Tabriz iOS — main screen: header, page tabs, panel sections, wheels, keyboard.
import SwiftUI

struct ContentView: View {
    @StateObject private var model = SynthModel()
    @State private var perfPanel: PerfPanel = .none

    var body: some View {
        GeometryReader { geo in
            let wide = geo.size.width > geo.size.height
            let kbHeight = wide ? geo.size.height * 0.36 : geo.size.height * 0.3
            HStack(spacing: 0) {
                walnut
                VStack(spacing: 6) {
                    header
                    tabs
                    if let e = model.error {
                        Text(e).font(.caption).foregroundColor(.red)
                    }
                    ZStack(alignment: .top) {
                        sections
                        if perfPanel == .arp {
                            ArpPanelView(model: model) { perfPanel = .none }
                                .frame(maxWidth: 560)
                        } else if perfPanel == .tuning {
                            TuningPanelView(model: model) { perfPanel = .none }
                                .frame(maxWidth: 640)
                        }
                    }
                    PerformanceBar(model: model, panel: $perfPanel)
                    HStack(spacing: 6) {
                        WheelStrip(label: "PB", springs: true) { model.bend($0) }
                        WheelStrip(label: "MOD", springs: false) { model.mod($0) }
                        KeyboardView(lowNote: 48 + model.octave * 12,
                                     onDown: { model.engine.noteDown(Int32($0), velocity: $1) },
                                     onUp: { model.engine.noteUp(Int32($0)) })
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                    .frame(height: kbHeight)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(LinearGradient(colors: [Theme.shellTop, Theme.shellBottom], startPoint: .top, endPoint: .bottom))
                walnut
            }
        }
        .background(Theme.page.ignoresSafeArea())
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .defersSystemGestures(on: .all)
    }

    // walnut cheek
    private var walnut: some View {
        LinearGradient(colors: Theme.walnut, startPoint: .topLeading, endPoint: .bottomTrailing)
            .overlay(LinearGradient(colors: [.black.opacity(0.45), .clear, .black.opacity(0.45)], startPoint: .leading, endPoint: .trailing))
            .frame(width: 14)
            .ignoresSafeArea()
    }

    // MARK: header

    private var header: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 0) {
                Text(model.panel?.name ?? "Tabriz")
                    .font(.system(size: 20, weight: .bold, design: .serif))
                    .foregroundColor(Theme.cream)
                Text(model.panel?.role ?? "").font(.system(size: 10)).foregroundColor(Theme.inkFaint)
            }
            Spacer(minLength: 6)
            pill("chevron.left") { model.step(-1) }
            Menu {
                ForEach(model.groups, id: \.self) { g in
                    Section(g) {
                        ForEach(Array(model.presets.enumerated()).filter { $0.element.group == g }, id: \.element.id) { i, p in
                            Button(p.name) { model.apply(i) }
                        }
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(model.currentName).font(.system(size: 14, weight: .bold))
                    if model.edited { Text("•").font(.system(size: 14, weight: .heavy)).foregroundColor(Theme.accent) }
                }
                .foregroundColor(Theme.btnInk)
                .lineLimit(1)
                .frame(minWidth: 150)
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(RoundedRectangle(cornerRadius: 3)
                    .fill(LinearGradient(colors: [Theme.btnTop, Theme.btnBottom], startPoint: .top, endPoint: .bottom))
                    .shadow(color: Color(hex: 0x6e6450), radius: 0, y: 3))
            }
            pill("chevron.right") { model.step(1) }
            if model.edited {
                pill("arrow.uturn.backward") { model.revert() }
            }
            Spacer(minLength: 6)
            Menu {
                ForEach([64, 128, 256, 512], id: \.self) { f in
                    Button("\(f) samples\(f == model.bufferFrames ? "  ✓" : "")") { model.setBuffer(f) }
                }
            } label: {
                Text("BUF \(model.bufferFrames)").font(.system(size: 11, weight: .heavy)).foregroundColor(Theme.cream)
                    .padding(.horizontal, 8).padding(.vertical, 7)
                    .background(RoundedRectangle(cornerRadius: 3).fill(Color(hex: 0x33241a)))
            }
            pill("minus") { model.shiftOctave(-1) }
            Text("OCT \(model.octave >= 0 ? "+" : "")\(model.octave)")
                .font(.system(size: 11, weight: .heavy).monospacedDigit()).foregroundColor(Theme.cream)
            pill("plus") { model.shiftOctave(1) }
        }
    }

    private func pill(_ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 13, weight: .bold)).foregroundColor(Theme.cream)
                .frame(width: 32, height: 30)
                .background(RoundedRectangle(cornerRadius: 3).fill(LinearGradient(colors: [Color(hex: 0x4a3526), Color(hex: 0x33241a)],
                                                                                   startPoint: .top, endPoint: .bottom)))
        }
    }

    // MARK: page tabs

    private var tabs: some View {
        HStack(spacing: 6) {
            ForEach(model.panel?.pages ?? [], id: \.self) { p in
                let on = p.id == model.page
                Button { model.page = p.id } label: {
                    Text(p.label).font(.system(size: 13, weight: .bold))
                        .foregroundColor(on ? Theme.accentInk : Theme.cream)
                        .frame(maxWidth: 170).frame(height: 30)
                        .background(tabBackground(on))
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 8)
            Text(model.stats).font(.system(size: 9).monospacedDigit()).foregroundColor(Theme.inkFaint)
                .lineLimit(1).minimumScaleFactor(0.5)
        }
    }

    private func tabBackground(_ on: Bool) -> some View {
        let active = LinearGradient(colors: [Theme.accentHi, Theme.accent, Theme.accentLo], startPoint: .top, endPoint: .bottom)
        let idle = LinearGradient(colors: [Color(hex: 0x262320), Color(hex: 0x262320)], startPoint: .top, endPoint: .bottom)
        return RoundedRectangle(cornerRadius: 3).fill(on ? active : idle)
    }

    // MARK: sections of the current page

    private var sections: some View {
        GeometryReader { geo in
            sectionRow(size: geo.size)
        }
    }

    private var pageSections: [SectionDef] {
        (model.panel?.sections ?? []).filter { $0.page == model.page }
    }

    /// Knob size that lets the tallest section (header + choice + full row + small row) fit.
    private func knobSize(for size: CGSize, columns: Int) -> CGFloat {
        let cols = CGFloat(max(1, columns))
        let cardW: CGFloat = (size.width - 8 * (cols - 1)) / cols
        let usable: CGFloat = size.height - 152
        let byHeight: CGFloat = usable / 1.78
        let byWidth: CGFloat = cardW / 3.5 - 8
        let s: CGFloat = min(byHeight, byWidth)
        return min(84, max(34, s))
    }

    private func sectionRow(size: CGSize) -> some View {
        let secs = pageSections
        let k = knobSize(for: size, columns: secs.count)
        return HStack(alignment: .top, spacing: 8) {
            ForEach(secs, id: \.self) { s in sectionCard(s) }
        }
        .environment(\.knobSize, k)
    }

    private func sectionCard(_ s: SectionDef) -> some View {
        SectionCard(title: s.title) {
            ForEach(Array(s.controls.enumerated()), id: \.offset) { _, c in control(c) }
        }
    }

    @ViewBuilder
    private func control(_ c: ControlDef) -> some View {
        switch c.kind {
        case "choice":
            if let key = c.key, let opts = c.options {
                ChoiceRow(options: opts, selected: model.choice(key)) { model.choose(key, $0) }
            }
        case "toggles":
            ToggleRow(items: c.items ?? [], value: { model.choice($0) }) { model.choose($0, $1) }
        default:
            VStack(spacing: 2) {
                if let cap = c.caption, !cap.isEmpty {
                    Text(cap).font(.system(size: 9, weight: .heavy)).foregroundColor(Theme.inkFaint)
                }
                HStack(alignment: .top, spacing: 2) {
                    ForEach(c.knobs ?? [], id: \.self) { k in
                        if let spec = model.panel?.params[k.key] {
                            KnobView(label: k.label, spec: spec, value: model.number(k.key), small: c.small == true,
                                     onChange: { model.set(k.key, $0) }, onReset: { model.resetToDefault(k.key) })
                        }
                    }
                }
            }
        }
    }
}
