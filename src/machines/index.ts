import { BAKU } from "./baku";
import { BAM } from "./bam";
import { BUSHEHR } from "./bushehr";
import { HORMOZ } from "./hormoz";
import { ISFAHAN } from "./isfahan";
import { KASHAN } from "./kashan";
import { KERMAN } from "./kerman";
import { KONYA } from "./konya";
import { MERV } from "./merv";
import { NISHAPUR } from "./nishapur";
import { RASHT } from "./rasht";
import { SHIRAZ } from "./shiraz";
import { SY1 } from "./sy1";
import { TABRIZ } from "./tabriz";
import { MachineDef } from "./types";
import { YAZD } from "./yazd";

/** All machines, in menu order. Adding a machine = one file + one line here. */
export const MACHINES: MachineDef[] = [SY1, YAZD, TABRIZ, BAKU, MERV, ISFAHAN, SHIRAZ, KASHAN, KONYA, NISHAPUR, BAM, KERMAN, BUSHEHR, RASHT, HORMOZ];

export function getMachineDef(id: string): MachineDef {
  return MACHINES.find((m) => m.id === id) || SY1;
}
