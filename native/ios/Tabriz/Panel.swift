// Tabriz iOS — panel layout and parameter specs, loaded from panel.json
// (generated from src/machines/tabriz.ts + src/engine/params.ts by
// native/tools/export-tabriz-presets.mts, so the app matches the website).
import Foundation

enum PatchValue: Decodable, Equatable {
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

struct ParamSpec: Decodable {
    let choice: Bool?
    let options: [String]?
    let min: Double?
    let max: Double?
    let step: Double?
    let log: Bool?
    let kind: String?
    let def: PatchValue

    var isChoice: Bool { choice == true }
    var lo: Double { min ?? 0 }
    var hi: Double { max ?? 1 }
    var defNumber: Double { if case .num(let n) = def { return n }; return lo }
    var defString: String { if case .str(let s) = def { return s }; return "" }

    /// 0..1 knob position for a value
    func norm(_ v: Double) -> Double {
        let x: Double
        if log == true, lo > 0 { x = Foundation.log(v / lo) / Foundation.log(hi / lo) } else { x = (v - lo) / (hi - lo) }
        return Swift.min(1, Swift.max(0, x))
    }

    /// value for a 0..1 knob position (snapped to step)
    func value(_ n: Double) -> Double {
        let x = Swift.min(1, Swift.max(0, n))
        var v = (log == true && lo > 0) ? lo * pow(hi / lo, x) : lo + (hi - lo) * x
        if let s = step, s > 0 { v = (v / s).rounded() * s }
        return v
    }

    /// Same text as the website's fmt() for this parameter (kind chosen by the exporter).
    func format(_ v: Double) -> String {
        func r(_ x: Double) -> Int { Int(x.rounded(.toNearestOrAwayFromZero)) }
        func sec(_ x: Double) -> String { x < 1 ? "\(r(x * 1000))ms" : String(format: "%.2fs", x) }
        switch kind ?? "" {
        case "pct": return "\(r(v * 100))%"
        case "sec": return sec(v)
        case "secOff": return v < 0.005 ? "Off" : sec(v)
        case "hz": return String(format: v < 1 ? "%.2fHz" : "%.1fHz", v)
        case "db": return (v > 0 ? "+" : "") + String(format: "%.1fdB", v)
        case "cents": return "\(r(v))¢"
        case "st": return "\(r(v))st"
        case "signed": return (v > 0 ? "+" : "") + "\(r(v))"
        case "freq": return v >= 1000 ? String(format: "%.1fk", v / 1000) : "\(r(v))"
        case "int": return "\(r(v))"
        case "div":
            let labels = ["1/1", "1/2", "1/4", "1/8", "1/8T", "1/16", "1/16T", "1/32"]
            let i = r(v) - 1
            return labels.indices.contains(i) ? labels[i] : "?"
        case "oct": return "\(r(v)) oct"
        case "note": return noteNames[((r(v) % 12) + 12) % 12]
        default: return String(format: "%.1f", v)
        }
    }
}

let noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

struct TuningDef: Decodable, Hashable {
    let id: String
    let label: String
    let name: String
    let tonic: Int
    let offsets: [Double]
    let approx: Bool
    let source: String
}

struct ChoiceOption: Decodable, Hashable {
    let value: String
    let text: String
    let title: String
}

struct ToggleItem: Decodable, Hashable {
    let key: String
    let label: String
    let on: String
    let off: String
}

struct KnobRef: Decodable, Hashable {
    let key: String
    let label: String
}

struct ControlDef: Decodable, Hashable {
    let kind: String          // "choice" | "toggles" | "row"
    let key: String?
    let options: [ChoiceOption]?
    let items: [ToggleItem]?
    let knobs: [KnobRef]?
    let small: Bool?
    let caption: String?
}

struct SectionDef: Decodable, Hashable {
    let title: String
    let page: String
    let controls: [ControlDef]
}

struct PageDef: Decodable, Hashable {
    let id: String
    let label: String
}

struct PanelDef: Decodable {
    let name: String
    let role: String
    let pages: [PageDef]
    let sections: [SectionDef]
    let params: [String: ParamSpec]
    let arpModes: [ChoiceOption]
    let tunings: [TuningDef]

    static func load() -> PanelDef? {
        guard let url = Bundle.main.url(forResource: "panel", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(PanelDef.self, from: data)
    }
}
