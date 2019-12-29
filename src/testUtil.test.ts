import { from } from "automerge";
import { mockDocStore } from "./testUtil";

test("docStore works as expected", async () => {
  const store = mockDocStore({});

  await store.setDoc("doc", from({ name: "hello" }));
  const doc = await store.getDoc("doc");
  expect(doc).toEqual({ name: "hello" });
});

test("docStore works as expected", async () => {
  const store = mockDocStore({});

  await store.setDoc("doc", from({ name: "hello" }));
  const doc = await store.getDoc("doc");
  expect(doc).toEqual({ name: "hello" });
});
