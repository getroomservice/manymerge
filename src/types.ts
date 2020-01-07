import { Change } from "automerge";
import { Map } from "immutable";

export type Clock = Map<string, number>;

export interface Message {
  clock: Clock;
  changes?: Change[];
}
