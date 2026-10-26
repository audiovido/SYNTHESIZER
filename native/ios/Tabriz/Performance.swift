// Tabriz iOS — performance bar (HOLD, ARP, ORIENTAL + tuning settings) and the
// two pop-over panels, like the website's keyboard bar, arp-panel.ts and
// oriental-panel.ts. The panels open over the controls, never over the keys.
import SwiftUI

enum PerfPanel { case none, arp, tuning }

struct PerfButton: View {
    let title: String
    var subtitle: String = ""
    let on: Bool
    var open = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 0) {
                HStack(spacing: 5) {
                    Circle().fill(on ? Theme.accent : Color(hex: 0x3a2214))
                        .overlay(Circle().stroke(Color(hex: 0x5a3a24), lineWidth: 1))
                        .shadow(color: on ? Theme.accent : .clear, radius: 4)
                        .frame(width: 7, height: 7)
                    Text(title).font(.system(size: 12, weight: .heavy))
                }
                if !subtitle.isEmpty {
                    Text(subtitle).font(.system(size: 9, weight: .bold)).lineLimit(1).minimumScaleFactor(0.6)
                }
            }
            .foregroundColor(Theme.btnInk)
            .padding(.horizontal, 12)
            .frame(minWidth: 70, minHeight: 34)
            .background(
                RoundedRectangle(cornerRadius: 3)
                    .fill(LinearGradient(colors: [Theme.btnTop, Theme.btnBottom], startPoint: .top, endPoint: .bottom))
                    .shadow(color: Color(hex: 0x6e6450), radius: 0, y: open ? 1 : 3)
            )
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(open ? Theme.accent : .clear, lineWidth: 2))
            .offset(y: open ? 2 : 0)
        }
        .buttonStyle(.plain)
    }
}

struct PerformanceBar: View {
    @ObservedObject var model: SynthModel
    @Binding var panel: PerfPanel

    var body: some View {
        HStack(spacing: 8) {
            PerfButton(title: "HOLD", on: model.choice("hold") == "on") { model.toggle("hold") }
            PerfButton(title: "ARP", on: model.choice("arpOn") == "on", open: panel == .arp) {
                panel = panel == .arp ? .none : .arp
            }
            PerfButton(title: "ORIENTAL", subtitle: model.choice("oriental") == "on" ? model.tuningLabel : "",
                       on: model.choice("oriental") == "on") { model.toggle("oriental") }
            Button { panel = panel == .tuning ? .none : .tuning } label: {
                Image(systemName: "slider.horizontal.3").font(.system(size: 14, weight: .bold))
                    .foregroundColor(Theme.btnInk)
                    .frame(width: 40, height: 34)
                    .background(RoundedRectangle(cornerRadius: 3)
                        .fill(LinearGradient(colors: [Theme.btnTop, Theme.btnBottom], startPoint: .top, endPoint: .bottom)))
                    .overlay(RoundedRectangle(cornerRadius: 3).stroke(panel == .tuning ? Theme.accent : .clear, lineWidth: 2))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Tuning settings")
            Spacer(minLength: 0)
        }
    }
}

/// Dark pop-over card with a cream title band and a close button.
struct PopCard<Content: View>: View {
    let title: String
    let onClose: () -> Void
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(title).font(.system(size: 12, weight: .heavy)).tracking(0.8).foregroundColor(Theme.btnInk)
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.system(size: 12, weight: .heavy)).foregroundColor(Theme.btnInk)
                        .frame(width: 30, height: 24)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
            .padding(.leading, 10)
            .background(LinearGradient(colors: [Theme.creamHi, Theme.creamLo], startPoint: .top, endPoint: .bottom))
            ScrollView { VStack(spacing: 10) { content }.padding(10) }
        }
        .background(Theme.panel)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.cream, lineWidth: 1))
        .shadow(color: .black.opacity(0.7), radius: 12)
    }
}

struct ArpPanelView: View {
    @ObservedObject var model: SynthModel
    let onClose: () -> Void

    var body: some View {
        PopCard(title: "ARPEGGIATOR", onClose: onClose) {
            HStack(spacing: 8) {
                ToggleRow(items: [ToggleItem(key: "arpOn", label: "ARP ON", on: "on", off: "off"),
                                  ToggleItem(key: "hold", label: "LATCH", on: "on", off: "off")],
                          value: { model.choice($0) }, onSet: { model.choose($0, $1) })
                tempo
            }
            ChoiceRow(options: model.panel?.arpModes ?? [], selected: model.choice("arpMode")) { model.choose("arpMode", $0) }
            HStack(alignment: .top, spacing: 2) {
                ForEach([("arpRate", "RATE"), ("arpOct", "OCT"), ("arpGate", "GATE"), ("arpSwing", "SWING")], id: \.0) { key, label in
                    if let spec = model.panel?.params[key] {
                        KnobView(label: label, spec: spec, value: model.number(key),
                                 onChange: { model.set(key, $0) }, onReset: { model.set(key, spec.defNumber) })
                    }
                }
            }
        }
    }

    private var tempo: some View {
        HStack(spacing: 4) {
            small("minus") { model.setTempo(model.tempo - 1) }
            Button { model.tapTempo() } label: {
                VStack(spacing: 0) {
                    Text("\(Int(model.tempo))").font(.system(size: 16, weight: .heavy).monospacedDigit())
                    Text("BPM · TAP").font(.system(size: 8, weight: .bold))
                }
                .foregroundColor(Theme.cream)
                .frame(width: 70, height: 34)
                .background(RoundedRectangle(cornerRadius: 3).fill(Color(hex: 0x33241a)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Tempo \(Int(model.tempo)) BPM. Tap in time to set it.")
            small("plus") { model.setTempo(model.tempo + 1) }
        }
    }

    private func small(_ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 12, weight: .bold)).foregroundColor(Theme.cream)
                .frame(width: 30, height: 34)
                .background(RoundedRectangle(cornerRadius: 3).fill(Color(hex: 0x33241a)))
        }
        .buttonStyle(.plain)
    }
}

struct TuningPanelView: View {
    @ObservedObject var model: SynthModel
    let onClose: () -> Void

    private let centSpec = ParamSpec(choice: nil, options: nil, min: -100, max: 100, step: 1, log: false,
                                     kind: "cents", def: .num(0))

    var body: some View {
        let on = model.choice("oriental") == "on"
        let current = model.choice("tuning")
        let root = Int(model.number("tuneRoot")) % 12
        PopCard(title: "TUNING", onClose: onClose) {
            HStack {
                Text("ORIENTAL").font(.system(size: 11, weight: .heavy)).foregroundColor(Theme.inkDim)
                Spacer()
                Toggle("", isOn: Binding(get: { on }, set: { model.choose("oriental", $0 ? "on" : "off") }))
                    .labelsHidden().tint(Theme.accent)
            }
            label("Scale")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 6)], spacing: 6) {
                ForEach(model.tunings, id: \.id) { t in
                    chip(selected: t.id == current) { model.selectTuning(t.id) } content: {
                        VStack(spacing: 0) {
                            Text(t.label + (t.approx ? " ~" : "")).font(.system(size: 12, weight: .bold))
                            if t.id != "12tet" && t.id != "custom" {
                                Text(noteNames[t.tonic]).font(.system(size: 9, weight: .semibold)).opacity(0.7)
                            }
                        }
                    }
                }
            }
            label("Tonic")
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 12), spacing: 4) {
                ForEach(0..<12, id: \.self) { i in
                    chip(selected: i == root) { model.set("tuneRoot", Double(i)) } content: {
                        Text(noteNames[i]).font(.system(size: 11, weight: .bold))
                    }
                }
            }
            if current == "custom" {
                HStack {
                    label("Cents per note  (−100 … +100, drag; double tap = 0)")
                    Spacer()
                    Button("Reset") { model.resetCustom() }
                        .font(.system(size: 11, weight: .bold)).foregroundColor(Theme.accent)
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 6), spacing: 6) {
                    ForEach(0..<12, id: \.self) { i in
                        KnobView(label: noteNames[i], spec: centSpec, value: model.customOffsets[i], small: true,
                                 onChange: { model.setCustomOffset(i, $0) }, onReset: { model.setCustomOffset(i, 0) })
                    }
                }
            }
            if let t = model.currentTuning {
                Text("\(t.id == "custom" ? "Custom" : t.name)\(t.approx ? " (approx.)" : "") · \(t.id == "custom" ? "Your own 12-note tuning, saved on this device." : t.source)")
                    .font(.system(size: 10)).foregroundColor(Theme.inkFaint)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func label(_ s: String) -> some View {
        Text(s).font(.system(size: 10, weight: .heavy)).foregroundColor(Theme.inkDim)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func chip<C: View>(selected: Bool, action: @escaping () -> Void, @ViewBuilder content: () -> C) -> some View {
        Button(action: action) {
            content()
                .foregroundColor(selected ? Theme.accentInk : Theme.btnInk)
                .frame(maxWidth: .infinity, minHeight: 34)
                .background(RoundedRectangle(cornerRadius: 3).fill(
                    LinearGradient(colors: selected ? [Theme.accentHi, Theme.accent, Theme.accentLo] : [Theme.btnTop, Theme.btnBottom],
                                   startPoint: .top, endPoint: .bottom)))
        }
        .buttonStyle(.plain)
    }
}
