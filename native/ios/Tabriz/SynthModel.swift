// Tabriz iOS — app state: panel, presets, parameter values, engine statistics.
import Foundation
import UIKit

final class SynthModel: ObservableObject {
    let engine = SynthEngine()
    let panel: PanelDef?

    @Published var presets: [Preset] = []
    @Published var presetIndex = 0
    @Published var edited = false
    @Published var values: [String: Double] = [:]
    @Published var choices: [String: String] = [:]
    @Published var page = "osc"
    @Published var octave = 0
    @Published var bufferFrames = 128
    @Published var stats = "starting audio…"
    @Published var error: String?
    @Published var tempo: Double = 110
    @Published var customOffsets: [Double] = Array(repeating: 0, count: 12)

    /// Performance controls: not part of presets, never mark the preset as edited.
    static let perfKeys: Set<String> = ["hold", "arpOn", "arpMode", "arpRate", "arpOct", "arpGate", "arpSwing",
                                        "oriental", "tuning", "tuneRoot"]
    private var taps: [Date] = []

    private var timer: Timer?
    private var saveWork: DispatchWorkItem?
    private let store = UserDefaults.standard

    init() {
        panel = PanelDef.load()
        if let url = Bundle.main.url(forResource: "presets", withExtension: "json"),
           let data = try? Data(contentsOf: url),
           let list = try? JSONDecoder().decode([Preset].self, from: data) {
            presets = list
        }
        if let p = panel { page = p.pages.first?.id ?? "osc" }
        do {
            try engine.start()
        } catch {
            self.error = "Audio could not start: \(error.localizedDescription)"
        }
        let savedBuf = store.integer(forKey: "tabriz.buffer")
        bufferFrames = [64, 128, 256, 512].contains(savedBuf) ? savedBuf : 128
        engine.setPreferredBufferFrames(Int32(bufferFrames))

        // defaults first, then the last session (or the first preset)
        for (key, spec) in panel?.params ?? [:] {
            if spec.isChoice { send(key, .str(spec.defString)) } else { send(key, .num(spec.defNumber)) }
        }
        if let saved = store.dictionary(forKey: "tabriz.patch") {
            presetIndex = min(max(0, store.integer(forKey: "tabriz.preset")), max(0, presets.count - 1))
            for (k, v) in saved {
                if let n = v as? Double { send(k, .num(n)) } else if let s = v as? String { send(k, .str(s)) }
            }
            edited = store.bool(forKey: "tabriz.edited")
        } else if !presets.isEmpty {
            apply(0)
        }
        if let c = store.array(forKey: "tabriz.customTuning") as? [Double], c.count == 12 { customOffsets = c }
        let t = store.double(forKey: "tabriz.tempo")
        setTempo(t >= 40 ? t : 110)
        sendTuning()
        UIApplication.shared.isIdleTimerDisabled = true
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.refreshStats() }
    }

    // MARK: presets

    var currentName: String { presets.isEmpty ? "—" : presets[presetIndex].name }
    var groups: [String] { presets.reduce(into: [String]()) { if !$0.contains($1.group) { $0.append($1.group) } } }

    func apply(_ index: Int) {
        guard presets.indices.contains(index) else { return }
        presetIndex = index
        engine.allNotesOff()
        for (key, v) in presets[index].patch { send(key, v) }
        edited = false
        saveSoon()
    }

    func step(_ d: Int) {
        guard !presets.isEmpty else { return }
        apply((presetIndex + d + presets.count) % presets.count)
    }

    func revert() { apply(presetIndex) }

    // MARK: parameters

    func number(_ key: String) -> Double { values[key] ?? panel?.params[key]?.defNumber ?? 0 }
    func choice(_ key: String) -> String { choices[key] ?? panel?.params[key]?.defString ?? "" }

    func set(_ key: String, _ v: Double) {
        guard values[key] != v else { return }
        send(key, .num(v))
        if !Self.perfKeys.contains(key) { edited = true }
        if key == "tuneRoot" { sendTuning() }
        saveSoon()
    }

    func choose(_ key: String, _ v: String) {
        guard choices[key] != v else { return }
        send(key, .str(v))
        if !Self.perfKeys.contains(key) { edited = true }
        if key == "oriental" || key == "tuning" { sendTuning() }
        saveSoon()
    }

    // MARK: HOLD / ARP / ORIENTAL

    func toggle(_ key: String) { choose(key, choice(key) == "on" ? "off" : "on") }

    var tunings: [TuningDef] { panel?.tunings ?? [] }
    var currentTuning: TuningDef? { tunings.first { $0.id == choice("tuning") } }
    var tuningLabel: String {
        guard let t = currentTuning, t.id != "12tet" else { return "" }
        return t.id == "custom" ? "Custom" : "\(t.label) · \(noteNames[Int(number("tuneRoot")) % 12])"
    }

    /// Picking a maqam/dastgah also sets its tonic and turns ORIENTAL on (like the website).
    func selectTuning(_ id: String) {
        choose("tuning", id)
        if let t = tunings.first(where: { $0.id == id }), id != "custom", id != "12tet" { set("tuneRoot", Double(t.tonic)) }
        if id != "12tet" && choice("oriental") != "on" { choose("oriental", "on") }
        sendTuning()
    }

    func setCustomOffset(_ degree: Int, _ cents: Double) {
        guard customOffsets.indices.contains(degree) else { return }
        customOffsets[degree] = max(-100, min(100, (cents * 10).rounded() / 10))
        store.set(customOffsets, forKey: "tabriz.customTuning")
        if choice("tuning") != "custom" { selectTuning("custom") } else { sendTuning() }
    }

    func resetCustom() {
        customOffsets = Array(repeating: 0, count: 12)
        store.set(customOffsets, forKey: "tabriz.customTuning")
        sendTuning()
    }

    /// Sends the cent offset of each pitch class (tc0..tc11) to the engine; held notes are retuned live.
    func sendTuning() {
        let on = choice("oriental") == "on"
        let offs = choice("tuning") == "custom" ? customOffsets : (currentTuning?.offsets ?? Array(repeating: 0, count: 12))
        let root = Int(number("tuneRoot"))
        for pc in 0..<12 {
            let deg = ((pc - root) % 12 + 12) % 12
            engine.setNumber(on && offs.indices.contains(deg) ? offs[deg] : 0, forKey: "tc\(pc)")
        }
    }

    func setTempo(_ bpm: Double) {
        tempo = max(40, min(240, bpm.rounded()))
        store.set(tempo, forKey: "tabriz.tempo")
        engine.setNumber(tempo, forKey: "tempo")
    }

    /// Tap tempo: average of the last taps within 2 seconds of each other.
    func tapTempo() {
        let now = Date()
        taps = taps.filter { now.timeIntervalSince($0) < 2 }
        taps.append(now)
        if taps.count >= 2 {
            let gaps = zip(taps.dropFirst(), taps).map { $0.timeIntervalSince($1) }
            setTempo(60 / (gaps.reduce(0, +) / Double(gaps.count)))
        }
        if taps.count > 6 { taps.removeFirst() }
    }

    func resetToDefault(_ key: String) {
        guard let spec = panel?.params[key] else { return }
        if let p = presets.indices.contains(presetIndex) ? presets[presetIndex].patch[key] : nil, case .num(let n) = p {
            set(key, n)
        } else {
            set(key, spec.defNumber)
        }
    }

    private func send(_ key: String, _ v: PatchValue) {
        switch v {
        case .num(let n):
            values[key] = n
            engine.setNumber(n, forKey: key)
        case .str(let s):
            choices[key] = s
            engine.setChoice(s, forKey: key)
        }
    }

    private func saveSoon() {
        saveWork?.cancel()
        let w = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            var d: [String: Any] = [:]
            for (k, v) in self.values { d[k] = v }
            for (k, v) in self.choices { d[k] = v }
            self.store.set(d, forKey: "tabriz.patch")
            self.store.set(self.presetIndex, forKey: "tabriz.preset")
            self.store.set(self.edited, forKey: "tabriz.edited")
        }
        saveWork = w
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6, execute: w)
    }

    // MARK: performance

    func setBuffer(_ frames: Int) {
        bufferFrames = frames
        store.set(frames, forKey: "tabriz.buffer")
        engine.setPreferredBufferFrames(Int32(frames))
    }

    func shiftOctave(_ d: Int) {
        engine.allNotesOff()
        octave = max(-3, min(3, octave + d))
    }

    func bend(_ v: Double) { engine.setPitchBend(v) }
    func mod(_ v: Double) { engine.setModWheel(v) }

    private func refreshStats() {
        guard error == nil else { return }
        let sr = engine.sampleRate
        let frames = Int(engine.bufferFrames)
        let ms = sr > 0 ? Double(frames) / sr * 1000 : 0
        stats = String(format: "%.0f kHz · %ld (%.1f ms) · out %.1f ms · DSP %ld%% · peak %ld%% · glitches %ld",
                       sr / 1000, frames, ms, engine.outputLatencyMs,
                       Int(engine.dspLoad * 100), Int(engine.dspLoadPeak * 100), Int(engine.glitches))
    }
}
