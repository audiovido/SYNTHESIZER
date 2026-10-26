import { choice, ChoiceOption, MachineDef, row, SEC, select, toggles, TUNING_OPTS } from "./types";

export const STR_MODEL_OPTS: ChoiceOption[] = [
  ["santur", "SANTUR", "Santur (hammered dulcimer)"],
  ["setar", "SETAR", "Setar (long-necked lute)"],
  ["tar", "TAR", "Tar (skin-top lute)"],
  ["kanun", "KANUN", "Kanun (plucked zither)"],
  ["oud", "OUD", "Oud (fretless lute)"],
  ["harp", "HARP", "Concert harp"]
];

/**
 * SHIRAZ — Plucked and hammered strings: extended Karplus-Strong physical
 * modelling with fractional all-pass tuning, stiffness dispersion, courses,
 * body formants, setar/tar bridge buzz, and santur mallet tremolo (riz).
 */
export const SHIRAZ: MachineDef = {
  id: "shiraz",
  name: "Shiraz",
  role: "Strings & santur",
  skin: "shiraz",
  kind: "synth",
  engine: "strings",
  pages: [
    { id: "strike", label: "Strike" },
    { id: "string", label: "String" },
    { id: "body", label: "Body" },
    { id: "space", label: "Space" }
  ],
  sections: [
    {
      title: "STRIKE",
      page: "strike",
      span: 2,
      wide: true,
      controls: [
        choice("strModel", STR_MODEL_OPTS),
        row([["strHard", "HARD"], ["strPos", "POS"], ["velSens", "VEL"]]),
        toggles([{ key: "riz", label: "RIZ", title: "Santur mallet tremolo while held" }]),
        row([["rizRate", "SPEED"]], { small: true })
      ]
    },
    {
      title: "STRING",
      page: "string",
      span: 2,
      wide: true,
      controls: [
        row([["strDecay", "DECAY"], ["strDamp", "DAMP"], ["strBright", "BRIGHT"], ["strStiff", "STIFF"]]),
        row([["strCourses", "COURSES"], ["strDetune", "DETUNE"]], { small: true })
      ]
    },
    {
      title: "BODY",
      page: "body",
      span: 1,
      controls: [
        row([["strBody", "BODY"], ["strTone", "TONE"], ["strBuzz", "BUZZ"]])
      ]
    },
    {
      title: "TUNING",
      page: "body",
      span: 1,
      controls: [
        select("tuning", "Tuning", TUNING_OPTS),
        row([["tuneRoot", "TONIC"]])
      ]
    },
    {
      ...SEC.space("space"),
      span: 2,
      wide: true
    }
  ],
  base: {
    // Subtractive pluck fallback if AudioWorklet is still loading
    polyMode: "poly", legato: "off", glide: 0, scoop: 0, tahrir: 0,
    osc1Wave: "triangle", osc2Wave: "square", osc2Oct: 1, oscMix: 0.3, sub: 0, noise: 0,
    cutoff: 2400, res: 2.5, envAmt: 0.65, fA: 0.002, fD: 0.28, fS: 0.05,
    aA: 0.002, aD: 0.85, aS: 0, aR: 0.55,
    // Physical-modelling string defaults
    strModel: "santur", strHard: 0.6, strPos: 0.16,
    strDecay: 4.2, strDamp: 0.24, strBright: 0.72, strStiff: 0.35,
    strCourses: 3, strDetune: 4,
    strBody: 0.45, strTone: 0.5, strBuzz: 0,
    riz: "off", rizRate: 11,
    oriental: "off", tuning: "shur", tuneRoot: 7, velSens: 0.65,
    revMix: 0.28, revSize: 2.8, delayMix: 0.12, delayTime: 0.34, delayFb: 0.3
  },
  presets: [
    // Santur
    {
      id: "santurShur",
      name: "Santur · Shur",
      group: "Santur",
      patch: {
        oriental: "on", strModel: "santur", tuning: "shur", tuneRoot: 7,
        strCourses: 3, strDetune: 4, strHard: 0.62, strPos: 0.16,
        strDecay: 4.5, strDamp: 0.22, strBright: 0.75, strStiff: 0.38,
        strBody: 0.45, strTone: 0.52, strBuzz: 0, riz: "off"
      }
    },
    {
      id: "santurRiz",
      name: "Santur Riz · Shur",
      group: "Santur",
      patch: {
        oriental: "on", strModel: "santur", tuning: "shur", tuneRoot: 7,
        riz: "on", rizRate: 11.5,
        strCourses: 3, strDetune: 5, strHard: 0.58, strPos: 0.18,
        strDecay: 3.8, strDamp: 0.26, strBright: 0.7, strStiff: 0.35,
        strBody: 0.48, strTone: 0.5, strBuzz: 0
      }
    },
    {
      id: "santurMahur",
      name: "Bright Santur · Mahur",
      group: "Santur",
      patch: {
        oriental: "on", strModel: "santur", tuning: "12tet", tuneRoot: 0,
        strCourses: 3, strDetune: 3, strHard: 0.78, strPos: 0.12,
        strDecay: 5.0, strDamp: 0.15, strBright: 0.88, strStiff: 0.45,
        strBody: 0.4, strTone: 0.62, strBuzz: 0, riz: "off"
      }
    },
    {
      id: "santurHomayoun",
      name: "Night Santur · Homayoun",
      group: "Santur",
      patch: {
        oriental: "on", strModel: "santur", tuning: "homayoun", tuneRoot: 7,
        strCourses: 3, strDetune: 6, strHard: 0.42, strPos: 0.24,
        strDecay: 6.2, strDamp: 0.35, strBright: 0.55, strStiff: 0.3,
        strBody: 0.55, strTone: 0.42, strBuzz: 0, riz: "off",
        revMix: 0.45, revSize: 3.8, delayMix: 0.22
      }
    },

    // Setar & Tar
    {
      id: "setarSegah",
      name: "Setar · Segah",
      group: "Setar & Tar",
      patch: {
        oriental: "on", strModel: "setar", tuning: "segah", tuneRoot: 4,
        strCourses: 2, strDetune: 3, strHard: 0.52, strPos: 0.14,
        strDecay: 2.8, strDamp: 0.32, strBright: 0.68, strStiff: 0.15,
        strBody: 0.55, strTone: 0.58, strBuzz: 0.38, riz: "off"
      }
    },
    {
      id: "setarTork",
      name: "Setar · Bayat-e Tork",
      group: "Setar & Tar",
      patch: {
        oriental: "on", strModel: "setar", tuning: "shur", tuneRoot: 5,
        strCourses: 2, strDetune: 2, strHard: 0.48, strPos: 0.16,
        strDecay: 3.2, strDamp: 0.3, strBright: 0.65, strStiff: 0.14,
        strBody: 0.52, strTone: 0.55, strBuzz: 0.32, riz: "off"
      }
    },
    {
      id: "tarChahargah",
      name: "Tar · Chahargah",
      group: "Setar & Tar",
      patch: {
        oriental: "on", strModel: "tar", tuning: "chahargah", tuneRoot: 0,
        strCourses: 2, strDetune: 4, strHard: 0.65, strPos: 0.13,
        strDecay: 2.5, strDamp: 0.36, strBright: 0.72, strStiff: 0.2,
        strBody: 0.62, strTone: 0.48, strBuzz: 0.48, riz: "off"
      }
    },
    {
      id: "tarLow",
      name: "Tar Low · Homayoun",
      group: "Setar & Tar",
      patch: {
        oriental: "on", strModel: "tar", tuning: "homayoun", tuneRoot: 7,
        strCourses: 2, strDetune: 5, strHard: 0.55, strPos: 0.18,
        strDecay: 3.4, strDamp: 0.42, strBright: 0.58, strStiff: 0.18,
        strBody: 0.68, strTone: 0.36, strBuzz: 0.42, riz: "off"
      }
    },

    // Kanun & Oud
    {
      id: "kanunRast",
      name: "Kanun · Rast",
      group: "Kanun & Oud",
      patch: {
        oriental: "on", strModel: "kanun", tuning: "rast", tuneRoot: 0,
        strCourses: 3, strDetune: 3, strHard: 0.7, strPos: 0.11,
        strDecay: 3.6, strDamp: 0.24, strBright: 0.82, strStiff: 0.22,
        strBody: 0.5, strTone: 0.6, strBuzz: 0.08, riz: "off"
      }
    },
    {
      id: "kanunBayati",
      name: "Kanun · Bayati",
      group: "Kanun & Oud",
      patch: {
        oriental: "on", strModel: "kanun", tuning: "bayati", tuneRoot: 2,
        strCourses: 3, strDetune: 4, strHard: 0.62, strPos: 0.14,
        strDecay: 4.0, strDamp: 0.28, strBright: 0.76, strStiff: 0.2,
        strBody: 0.52, strTone: 0.54, strBuzz: 0.06, riz: "off",
        delayMix: 0.2
      }
    },
    {
      id: "oudHijaz",
      name: "Oud · Hijaz",
      group: "Kanun & Oud",
      patch: {
        oriental: "on", strModel: "oud", tuning: "hijaz", tuneRoot: 2,
        strCourses: 2, strDetune: 3, strHard: 0.42, strPos: 0.22,
        strDecay: 2.2, strDamp: 0.52, strBright: 0.48, strStiff: 0.06,
        strBody: 0.72, strTone: 0.35, strBuzz: 0.05, riz: "off"
      }
    },
    {
      id: "oudSoft",
      name: "Oud Soft · Bayati",
      group: "Kanun & Oud",
      patch: {
        oriental: "on", strModel: "oud", tuning: "bayati", tuneRoot: 2,
        strCourses: 2, strDetune: 2, strHard: 0.3, strPos: 0.28,
        strDecay: 2.6, strDamp: 0.62, strBright: 0.38, strStiff: 0.04,
        strBody: 0.76, strTone: 0.3, strBuzz: 0, riz: "off"
      }
    },

    // Other
    {
      id: "harpGlass",
      name: "Harp Glass",
      group: "Other",
      patch: {
        oriental: "off", strModel: "harp", tuning: "12tet", tuneRoot: 0,
        strCourses: 1, strDetune: 0, strHard: 0.38, strPos: 0.32,
        strDecay: 6.5, strDamp: 0.2, strBright: 0.75, strStiff: 0.12,
        strBody: 0.38, strTone: 0.55, strBuzz: 0, riz: "off",
        revMix: 0.45, revSize: 3.6
      }
    },
    {
      id: "mutedPluck",
      name: "Muted Pluck",
      group: "Other",
      patch: {
        oriental: "off", strModel: "harp", tuning: "12tet", tuneRoot: 0,
        strCourses: 1, strDetune: 0, strHard: 0.35, strPos: 0.26,
        strDecay: 0.55, strDamp: 0.78, strBright: 0.42, strStiff: 0.05,
        strBody: 0.42, strTone: 0.45, strBuzz: 0, riz: "off",
        aD: 0.35, delayMix: 0.25, delayTime: 0.28
      }
    },
{ id: "santurChahargahRiz", name: "Santur Riz · Chahargah", group: "Santur", patch: { oriental: "on", strModel: "santur", tuning: "chahargah", tuneRoot: 0, riz: "on", rizRate: 13, strCourses: 3, strDetune: 4, strHard: 0.66, strPos: 0.15, strDecay: 3.5, strDamp: 0.24, strBright: 0.78, strStiff: 0.4, strBody: 0.45, strTone: 0.55, strBuzz: 0 } },
    { id: "santurSoft", name: "Felt Santur · Segah", group: "Santur", patch: { oriental: "on", strModel: "santur", tuning: "segah", tuneRoot: 4, strCourses: 3, strDetune: 5, strHard: 0.28, strPos: 0.22, strDecay: 5.5, strDamp: 0.4, strBright: 0.45, strStiff: 0.3, strBody: 0.55, strTone: 0.4, strBuzz: 0, riz: "off", revMix: 0.4 } },
    { id: "dulcimer", name: "Hammered Dulcimer", group: "Santur", patch: { oriental: "off", strModel: "santur", tuning: "12tet", tuneRoot: 0, strCourses: 2, strDetune: 6, strHard: 0.7, strPos: 0.14, strDecay: 4.2, strDamp: 0.25, strBright: 0.8, strStiff: 0.42, strBody: 0.42, strTone: 0.6, strBuzz: 0, riz: "off" } },
    { id: "setarMahur", name: "Setar · Mahur", group: "Setar & Tar", patch: { oriental: "on", strModel: "setar", tuning: "12tet", tuneRoot: 0, strCourses: 2, strDetune: 2, strHard: 0.55, strPos: 0.15, strDecay: 3, strDamp: 0.28, strBright: 0.7, strStiff: 0.15, strBody: 0.5, strTone: 0.58, strBuzz: 0.35, riz: "off" } },
    { id: "tarShurBright", name: "Tar Mezrab · Shur", group: "Setar & Tar", patch: { oriental: "on", strModel: "tar", tuning: "shur", tuneRoot: 7, riz: "on", rizRate: 9, strCourses: 2, strDetune: 3, strHard: 0.75, strPos: 0.12, strDecay: 2.2, strDamp: 0.34, strBright: 0.78, strStiff: 0.22, strBody: 0.6, strTone: 0.5, strBuzz: 0.42 } },
    { id: "kanunHijaz", name: "Kanun · Hijaz", group: "Kanun & Oud", patch: { oriental: "on", strModel: "kanun", tuning: "hijaz", tuneRoot: 2, strCourses: 3, strDetune: 3, strHard: 0.6, strPos: 0.12, strDecay: 4, strDamp: 0.22, strBright: 0.8, strStiff: 0.18, strBody: 0.45, strTone: 0.6, strBuzz: 0, riz: "off", revMix: 0.3 } },
    { id: "oudRast", name: "Oud · Rast", group: "Kanun & Oud", patch: { oriental: "on", strModel: "oud", tuning: "rast", tuneRoot: 0, strCourses: 2, strDetune: 4, strHard: 0.45, strPos: 0.2, strDecay: 3.2, strDamp: 0.42, strBright: 0.55, strStiff: 0.1, strBody: 0.65, strTone: 0.42, strBuzz: 0.05, riz: "off", revMix: 0.28 } },
    { id: "oudTremolo", name: "Oud Tremolo · Bayati", group: "Kanun & Oud", patch: { oriental: "on", strModel: "oud", tuning: "bayati", tuneRoot: 2, riz: "on", rizRate: 12, strCourses: 2, strDetune: 4, strHard: 0.5, strPos: 0.18, strDecay: 2.6, strDamp: 0.4, strBright: 0.6, strStiff: 0.1, strBody: 0.62, strTone: 0.45, strBuzz: 0.05 } },
    { id: "nylonGuitar", name: "Nylon Guitar", group: "Other", patch: { oriental: "off", strModel: "oud", tuning: "12tet", tuneRoot: 0, strCourses: 1, strDetune: 0, strHard: 0.4, strPos: 0.2, strDecay: 3.6, strDamp: 0.45, strBright: 0.55, strStiff: 0.08, strBody: 0.6, strTone: 0.45, strBuzz: 0, riz: "off", revMix: 0.25 } },
    { id: "kotoish", name: "Koto-ish", group: "Other", patch: { oriental: "off", strModel: "kanun", tuning: "12tet", tuneRoot: 0, strCourses: 1, strDetune: 0, strHard: 0.68, strPos: 0.1, strDecay: 3, strDamp: 0.3, strBright: 0.72, strStiff: 0.3, strBody: 0.5, strTone: 0.55, strBuzz: 0.1, riz: "off", revMix: 0.35 } },
    { id: "celestialHarp", name: "Celestial Harp", group: "Other", patch: { oriental: "off", strModel: "harp", tuning: "12tet", tuneRoot: 0, strCourses: 2, strDetune: 6, strHard: 0.3, strPos: 0.3, strDecay: 8, strDamp: 0.15, strBright: 0.7, strStiff: 0.1, strBody: 0.35, strTone: 0.6, strBuzz: 0, riz: "off", delayMix: 0.3, delayTime: 0.5, delayFb: 0.45, revMix: 0.55, revSize: 5 } },
    { id: "sitarish", name: "Sitar-ish Drone", group: "Other", patch: { oriental: "off", strModel: "setar", tuning: "12tet", tuneRoot: 0, strCourses: 3, strDetune: 7, strHard: 0.6, strPos: 0.1, strDecay: 6, strDamp: 0.2, strBright: 0.8, strStiff: 0.2, strBody: 0.5, strTone: 0.6, strBuzz: 0.75, riz: "off", revMix: 0.35 } }
  ]
};
