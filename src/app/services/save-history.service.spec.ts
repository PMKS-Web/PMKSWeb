import { Injector } from '@angular/core';
import { SaveHistoryService } from './save-history.service';
import { UrlGenerationService } from './url-generation.service';
import { UrlProcessorService } from './url-processor.service';

describe('SaveHistoryService', () => {
  it('restores serialized settings together with the mechanism on undo and redo', () => {
    const states = ['metric-state', 'english-state'];
    const generator = {
      generateUrlQuery: () => states.shift()!,
    } as unknown as UrlGenerationService;
    const restores: unknown[][] = [];
    const processor = {
      updateFromURL: (...args: unknown[]) => restores.push(args),
    } as unknown as UrlProcessorService;
    const injector = {
      get: () => processor,
    } as unknown as Injector;
    const history = new SaveHistoryService(generator, injector);

    history.save();
    history.save();
    history.undo();
    history.redo();

    // The trailing flag says "this is a step within one mechanism's history,
    // not a different mechanism arriving". Per-joint memory -- the slot stash,
    // the cylinder-skin preference -- is keyed by joint letter, so a fresh load
    // has to forget it and an undo must not. Dropping the flag here would make
    // undo clear the thing it exists to restore.
    expect(restores).toEqual([
      ['metric-state', false, true, false, true],
      ['english-state', false, true, false, true],
    ]);
  });
});
