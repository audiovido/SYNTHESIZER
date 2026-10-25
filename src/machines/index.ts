import { BAKU } from "./baku";
import { BAM } from "./bam";
import { ISFAHAN } from "./isfahan";
import { KERMAN } from "./kerman";
import { MERV } from "./merv";
import { SY1 } from "./sy1";
import { TABRIZ } from "./tabriz";
import { MachineDef } from "./types";
import { YAZD } from "./yazd";

/** All machines, in menu order. Adding a machine = one file + one line here. */
export const MACHINES: MachineDef[] = [SY1, YAZD, TABRIZ, BAKU, MERV, ISFAHAN, BAM, KERMAN];

export function getMachineDef(id: string): MachineDef {
  return MACHINES.find((m) => m.id === id) || SY1;
}
