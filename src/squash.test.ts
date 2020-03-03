import { from, getChanges, init } from 'automerge';
import { getClock } from 'automerge-clocks';
import { Hub } from './hub';
import { squash } from './squash';

test('squashed messages in any order provide the same result', () => {
  const blank = init<any>();
  const ucla = from({ title: 'Cool Title' });
  const stanford = from({ body: 'blah blah blah academia' });
  const hub = new Hub(jest.fn(), jest.fn());

  const uclaFirstMsg = squash(
    {
      clock: getClock(ucla),
      changes: getChanges(blank, ucla),
    },
    {
      clock: getClock(stanford),
      changes: getChanges(blank, stanford),
    }
  );

  const stanfordFirstMsg = squash(
    {
      clock: getClock(stanford),
      changes: getChanges(blank, stanford),
    },
    {
      clock: getClock(ucla),
      changes: getChanges(blank, ucla),
    }
  );

  const doc = hub.applyMessage('a', uclaFirstMsg, blank);
  expect(doc).toEqual({
    title: 'Cool Title',
    body: 'blah blah blah academia',
  });

  expect(hub.applyMessage('a', uclaFirstMsg, blank)).toEqual(
    hub.applyMessage('b', stanfordFirstMsg, blank)
  );
});
