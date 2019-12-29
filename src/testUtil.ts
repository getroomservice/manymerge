import { Doc } from "automerge";

export function mockDocStore(docs: { [key: string]: Doc<any> }) {
  let pool = { ...docs };

  const store = {
    getDoc: jest.fn().mockImplementation(id => pool[id]),
    setDoc: jest.fn().mockImplementation((id, doc) => {
      pool[id] = doc;
      return doc;
    })
  };

  return store;
}
