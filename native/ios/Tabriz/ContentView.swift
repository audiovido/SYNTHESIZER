// Tabriz iOS — main screen: presets, knobs, engine stats, keyboard.
import SwiftUI

extension Color {
    static let panel = Color(red: 0.16, green: 0.11, blue: 0.08)
    static let wood = Color(red: 0.30, green: 0.18, blue: 0.10)
    static let accent = Color(red: 0.95, green: 0.55, blue: 0.20)
    static let cream = Color(red: 0.93, green: 0.88, blue: 0.78)
}

struct Knob: View {
    let spec: KnobSpec
    let value: Double
    let onChange: (Double) -> Void
    @State private var startNorm: Double?

    var body: some View {
        let n = spec.norm(value)
        VStack(spacing: 3) {
            ZStack {
                Circle().trim(from: 0, to: 0.75)
                    .stroke(Color.black.opacity(0.45), style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(135))
                Circle().trim(from: 0, to: 0.75 * n)
                    .stroke(Color.accent, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(135))
                Circle().fill(LinearGradient(colors: [Color(white: 0.92), Color(white: 0.65)],
                                             startPoint: .top, endPoint: .bottom))
                    .padding(7)
                    .shadow(radius: 2, y: 1)
                Capsule().fill(Color.black.opacity(0.8))
                    .frame(width: 3, height: 11)
                    .offset(y: -10)
                    .rotationEffect(.degrees(-135 + 270 * n))
            }
            .frame(width: 48, height: 48)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { g in
                    if startNorm == nil { startNorm = n }
                    let delta = (-g.translation.height + g.translation.width * 0.5) / 160
                    onChange(spec.value((startNorm ?? n) + delta))
                }
                .onEnded { _ in startNorm = nil })
            Text(spec.label).font(.system(size: 10, weight: .bold)).foregroundColor(.cream)
            Text(spec.format(value)).font(.system(size: 10).monospacedDigit()).foregroundColor(.cream.opacity(0.7))
        }
        .frame(minWidth: 56)
    }
}

struct ContentView: View {
    @StateObject private var model = SynthModel()

    var body: some View {
        GeometryReader { geo in
            let wide = geo.size.width > geo.size.height
            VStack(spacing: 6) {
                header
                if let e = model.error {
                    Text(e).font(.caption).foregroundColor(.red)
                } else {
                    Text(model.stats).font(.system(size: 10).monospacedDigit())
                        .foregroundColor(.cream.opacity(0.65)).lineLimit(1).minimumScaleFactor(0.6)
                }
                knobs(wide: wide)
                KeyboardView(lowNote: 48 + model.octave * 12,
                             onDown: { model.engine.noteDown(Int32($0), velocity: $1) },
                             onUp: { model.engine.noteUp(Int32($0)) })
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .frame(height: wide ? geo.size.height * 0.46 : geo.size.height * 0.36)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 10).fill(Color.panel))
            .padding(.horizontal, wide ? 14 : 6)
        }
        .background(Color.wood.ignoresSafeArea())
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .defersSystemGestures(on: .all)
    }

    private var header: some View {
        HStack(spacing: 8) {
            Text("TABRIZ").font(.system(size: 17, weight: .heavy)).foregroundColor(.accent)
            Spacer(minLength: 4)
            button("chevron.left") { model.step(-1) }
            Menu {
                ForEach(model.groups, id: \.self) { g in
                    Section(g) {
                        ForEach(Array(model.presets.enumerated()).filter { $0.element.group == g }, id: \.element.id) { i, p in
                            Button(p.name) { model.apply(i) }
                        }
                    }
                }
            } label: {
                Text(model.currentName).font(.system(size: 14, weight: .semibold)).foregroundColor(.cream)
                    .lineLimit(1).frame(minWidth: 120)
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color.black.opacity(0.35)))
            }
            button("chevron.right") { model.step(1) }
            Spacer(minLength: 4)
            Menu {
                ForEach([64, 128, 256, 512], id: \.self) { f in
                    Button("\(f) samples\(f == model.bufferFrames ? "  ✓" : "")") { model.setBuffer(f) }
                }
            } label: {
                Text("BUF \(model.bufferFrames)").font(.system(size: 11, weight: .bold)).foregroundColor(.cream)
                    .padding(.horizontal, 8).padding(.vertical, 6)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color.black.opacity(0.35)))
            }
            button("minus") { model.shiftOctave(-1) }
            Text("OCT \(model.octave >= 0 ? "+" : "")\(model.octave)")
                .font(.system(size: 11, weight: .bold).monospacedDigit()).foregroundColor(.cream)
            button("plus") { model.shiftOctave(1) }
        }
    }

    private func button(_ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 13, weight: .bold)).foregroundColor(.cream)
                .frame(width: 32, height: 30)
                .background(RoundedRectangle(cornerRadius: 6).fill(Color.black.opacity(0.35)))
        }
    }

    @ViewBuilder
    private func knobs(wide: Bool) -> some View {
        let specs = SynthModel.knobs
        if wide {
            HStack(spacing: 2) {
                ForEach(specs) { s in knob(s).frame(maxWidth: .infinity) }
            }
        } else {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: 8) {
                ForEach(specs) { s in knob(s) }
            }
        }
        Spacer(minLength: 0)
    }

    private func knob(_ s: KnobSpec) -> some View {
        Knob(spec: s, value: model.values[s.key] ?? s.min) { model.set(s.key, $0) }
    }
}
