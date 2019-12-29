import { Doc, load, save } from "automerge";
import { mapValues } from "lodash";
import { AsyncDocStore } from ".";

export function mockDocStore(docs: { [key: string]: Doc<any> }) {
  let pool = mapValues(docs, doc => save(doc));

  const store: AsyncDocStore = {
    getDoc: jest.fn().mockImplementation(id => {
      if (!pool[id]) return undefined;
      return load(pool[id]);
    }),
    setDoc: jest.fn().mockImplementation((id, doc) => {
      pool[id] = save(doc);
      return doc;
    })
  };

  return store;
}
