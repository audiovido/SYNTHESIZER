// Tabriz iOS — app state: presets, knob values, engine statistics.
import Foundation
import UIKit

enum PatchValue: Decodable {
    case num(Double)
    case str(String)

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let v = try? c.decode(Double.self) { self = .num(v) } else { self = .str(try c.decode(String.self)) }
    }
}

struct Preset: Decodable, Identifiable {
    let id: String
    let name: String
    let group: String
    let patch: [String: PatchValue]
}

struct KnobSpec: Identifiable {
    let key: String
    let label: String
    let min: Double
    let max: Double
    let log: Bool
    let format: (Double) -> String
    var id: String { key }

    func norm(_ v: Double) -> Double {
        let x = log ? Foundation.log(v / min) / Foundation.log(max / min) : (v - min) / (max - min)
        return Swift.min(1, Swift.max(0, x))
    }

    func value(_ n: Double) -> Double {
        let x = Swift.min(1, Swift.max(0, n))
        return log ? min * pow(max / min, x) : min + (max - min) * x
    }
}

private func pct(_ v: Double) -> String { "\(Int((v * 100).rounded()))%" }
private func sec(_ v: Double) -> String { v < 0.005 ? "Off" : v < 1 ? "\(Int((v * 1000).rounded()))ms" : String(format: "%.2fs", v) }

final class SynthModel: ObservableObject {
    let engine = SynthEngine()

    @Published var presets: [Preset] = []
    @Published var presetIndex = 0
    @Published var values: [String: Double] = [:]
    @Published var octave = 0
    @Published var bufferFrames = 128
    @Published var stats = "starting audio…"
    @Published var error: String?

    static let knobs: [KnobSpec] = [
        KnobSpec(key: "cutoff", label: "CUTOFF", min: 40, max: 18000, log: true,
                 format: { $0 >= 1000 ? String(format: "%.1fk", $0 / 1000) : "\(Int($0))" }),
        KnobSpec(key: "res", label: "EMPHASIS", min: 0.1, max: 18, log: true, format: { String(format: "%.1f", $0) }),
        KnobSpec(key: "envAmt", label: "CONTOUR", min: 0, max: 1, log: false, format: pct),
        KnobSpec(key: "fD", label: "DECAY", min: 0.01, max: 4, log: true, format: sec),
        KnobSpec(key: "filterDrive", label: "DRIVE", min: 0, max: 1, log: false, format: pct),
        KnobSpec(key: "osc3Level", label: "OSC 3", min: 0, max: 1, log: false, format: pct),
        KnobSpec(key: "glide", label: "GLIDE", min: 0, max: 1.5, log: false, format: sec),
        KnobSpec(key: "drift", label: "DRIFT", min: 0, max: 1, log: false, format: pct),
        KnobSpec(key: "volume", label: "VOLUME", min: 0, max: 1, log: false, format: pct),
    ]

    private var timer: Timer?

    init() {
        if let url = Bundle.main.url(forResource: "presets", withExtension: "json"),
           let data = try? Data(contentsOf: url),
           let list = try? JSONDecoder().decode([Preset].self, from: data) {
            presets = list
        }
        do {
            try engine.start()
            engine.setPreferredBufferFrames(Int32(bufferFrames))
        } catch {
            self.error = "Audio could not start: \(error.localizedDescription)"
        }
        if !presets.isEmpty { apply(0) }
        UIApplication.shared.isIdleTimerDisabled = true
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.refreshStats() }
    }

    var currentName: String { presets.isEmpty ? "—" : presets[presetIndex].name }
    var groups: [String] { presets.reduce(into: [String]()) { if !$0.contains($1.group) { $0.append($1.group) } } }

    func apply(_ index: Int) {
        guard presets.indices.contains(index) else { return }
        presetIndex = index
        engine.allNotesOff()
        for (key, v) in presets[index].patch {
            switch v {
            case .num(let n):
                engine.setNumber(n, forKey: key)
                values[key] = n
            case .str(let s):
                engine.setChoice(s, forKey: key)
            }
        }
    }

    func step(_ d: Int) {
        guard !presets.isEmpty else { return }
        apply((presetIndex + d + presets.count) % presets.count)
    }

    func set(_ key: String, _ v: Double) {
        values[key] = v
        engine.setNumber(v, forKey: key)
    }

    func setBuffer(_ frames: Int) {
        bufferFrames = frames
        engine.setPreferredBufferFrames(Int32(frames))
    }

    func shiftOctave(_ d: Int) {
        engine.allNotesOff()
        octave = max(-2, min(2, octave + d))
    }

    private func refreshStats() {
        guard error == nil else { return }
        let sr = engine.sampleRate
        let frames = engine.bufferFrames
        let bufMs = sr > 0 ? Double(frames) / sr * 1000 : 0
        stats = String(format: "%.0f kHz · buffer %d (%.1f ms) · output latency %.1f ms · DSP %ld%% (peak %ld%%) · glitches %d",
                       sr / 1000, frames, bufMs, engine.outputLatencyMs,
                       Int(engine.dspLoad * 100), Int(engine.dspLoadPeak * 100), engine.glitches)
    }
}
