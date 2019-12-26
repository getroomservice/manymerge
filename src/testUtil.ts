import { Doc } from "automerge";

export function mockDocStore(docs: { [key: string]: Doc<any> }) {
  const store = {
    getDoc: jest.fn().mockImplementation(id => docs[id]),
    setDoc: jest.fn().mockImplementation((_, doc) => doc)
  };

  return store;
}
