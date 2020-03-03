import { union } from 'automerge-clocks';
import { Message } from './types';

/**
 * Squash messages together before applying them!
 *
 * If you're getting a lot of messages all at once,
 * you can squash them together before applying them
 * to reduce the number of calls to slow functions
 * (such as applying a lot of changes!).
 *
 * It always takes the latest clock and does not
 * assume any ordering in changes (which is fine).
 */
export function squash(msgOne: Message, msgTwo: Message) {
  const changes = (msgOne.changes || []).concat(msgTwo.changes || []);
  const clock = union(msgOne.clock, msgTwo.clock);
  return {
    changes,
    clock,
  };
}
