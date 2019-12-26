import { Map } from "immutable";

declare module "automerge" {
  interface BackendState extends Map<any, any> {}

  interface Clock extends Map<string, number> {}
}
