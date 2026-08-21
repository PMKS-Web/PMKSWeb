import { Injectable, NgZone, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, Subject } from 'rxjs';

/**
 * Everything a key can ask for. The string is the shortcut's identity: the
 * registry below names it, the component that owns the action listens for it,
 * and a tooltip asks for its keys by it.
 */
export type ShortcutId =
  | 'mode.synthesis'
  | 'mode.edit'
  | 'mode.kinematic'
  | 'mode.force'
  | 'playback.toggle'
  | 'playback.back'
  | 'playback.forward'
  | 'playback.speed'
  | 'view.zoomIn'
  | 'view.zoomOut'
  | 'view.reset'
  | 'view.centerOfMass'
  | 'view.jointIds'
  | 'view.paths'
  | 'edit.lock'
  | 'edit.deselect'
  | 'edit.delete'
  | 'history.undo'
  | 'history.redo'
  | 'app.settings'
  | 'app.help';

export interface Shortcut {
  id: ShortcutId;
  /** The heading this falls under wherever the whole set is listed. */
  section: 'Modes' | 'Playback' | 'View' | 'Editing' | 'General';
  /** What pressing it does, in the same words the control it doubles uses. */
  label: string;
  /** The keys as a reader should see them, already in this platform's signs. */
  keys: string;
  /** `event.key` values that fire it, lowercased. */
  match: string[];
  /** Whether Ctrl (or Command) has to be down. Undefined means "must not be". */
  meta?: boolean;
}

/** Command on a Mac, Ctrl everywhere else -- shown the way the platform writes it. */
function onAMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

/**
 * The keys, and what they ask for.
 *
 * One table, because a shortcut has to be two things at once and they must not
 * drift: the key that fires it, and the hint on the control it doubles. A
 * hint written into a template by hand is a hint nobody updates when the key
 * moves -- so nothing here is written twice, and a control asks for its own
 * hint by id.
 *
 * The actions are deliberately *not* here. They belong to the components that
 * already own them, with the guards those components already apply -- a mode
 * that is not ready opens its setup drawer rather than switching, and a
 * transport with nothing to play stays put. A service reaching past them to do
 * the work itself would have to repeat every one of those rules.
 */
@Injectable({ providedIn: 'root' })
export class KeyboardShortcutsService {
  private zone = inject(NgZone);
  private dialog = inject(MatDialog);
  private readonly presses = new Subject<ShortcutId>();

  /** Fires when a shortcut's keys are pressed anywhere outside a text field. */
  readonly pressed: Observable<ShortcutId> = this.presses.asObservable();

  private readonly mod = onAMac() ? '⌘' : 'Ctrl';

  readonly shortcuts: Shortcut[] = [
    { id: 'mode.synthesis', section: 'Modes', label: 'Synthesis', keys: '1', match: ['1'] },
    { id: 'mode.edit', section: 'Modes', label: 'Edit', keys: '2', match: ['2'] },
    {
      id: 'mode.kinematic',
      section: 'Modes',
      label: 'Kinematic Analysis',
      keys: '3',
      match: ['3'],
    },
    { id: 'mode.force', section: 'Modes', label: 'Force Analysis', keys: '4', match: ['4'] },

    {
      id: 'playback.toggle',
      section: 'Playback',
      label: 'Play / Pause',
      keys: 'Space',
      match: [' ', 'spacebar'],
    },
    {
      id: 'playback.back',
      section: 'Playback',
      label: 'Step back one frame',
      keys: '←',
      match: ['arrowleft'],
    },
    {
      id: 'playback.forward',
      section: 'Playback',
      label: 'Step forward one frame',
      keys: '→',
      match: ['arrowright'],
    },
    {
      id: 'playback.speed',
      section: 'Playback',
      label: 'Cycle playback speed',
      keys: 'S',
      match: ['s'],
    },

    { id: 'view.zoomIn', section: 'View', label: 'Zoom In', keys: '+', match: ['+', '='] },
    { id: 'view.zoomOut', section: 'View', label: 'Zoom Out', keys: '−', match: ['-', '_'] },
    { id: 'view.reset', section: 'View', label: 'Reset View', keys: '0', match: ['0'] },
    {
      id: 'view.centerOfMass',
      section: 'View',
      label: 'Center of mass',
      keys: 'M',
      match: ['m'],
    },
    { id: 'view.jointIds', section: 'View', label: 'Joint IDs', keys: 'L', match: ['l'] },
    { id: 'view.paths', section: 'View', label: 'Traced paths', keys: 'P', match: ['p'] },

    {
      id: 'edit.lock',
      section: 'Editing',
      label: 'Lock / Unlock what is selected',
      keys: 'K',
      match: ['k'],
    },
    {
      id: 'edit.deselect',
      section: 'Editing',
      label: 'Deselect',
      keys: 'Esc',
      match: ['escape', 'esc'],
    },
    {
      id: 'edit.delete',
      section: 'Editing',
      label: 'Delete what is selected',
      // Backspace as well as Delete: a MacBook has one key here and it sends
      // Backspace, so Delete alone left the shortcut unreachable on the
      // keyboard it is printed on.
      keys: 'Delete',
      match: ['delete', 'backspace'],
    },
    {
      id: 'history.undo',
      section: 'Editing',
      label: 'Undo',
      keys: `${this.mod}Z`,
      match: ['z'],
      meta: true,
    },
    {
      id: 'history.redo',
      section: 'Editing',
      label: 'Redo',
      keys: `${this.mod}⇧Z`,
      match: ['y'],
      meta: true,
    },
    {
      id: 'app.settings',
      section: 'General',
      label: 'Settings',
      // The key every application puts preferences on, minus the modifier:
      // nothing on this canvas is typed, so the plain comma is free.
      keys: ',',
      match: [','],
    },
    {
      id: 'app.help',
      section: 'General',
      label: 'Help, and this list',
      keys: '?',
      // The character, not the keystroke that makes it: which key and which
      // modifiers produce a question mark is a matter of layout, and asking
      // for Shift and the US layout's slash left it unreachable on the rest.
      match: ['?'],
    },
  ];

  constructor() {
    if (typeof window === 'undefined') return;
    // Outside Angular, then back in only when a key actually matches: this
    // listener sees every keystroke in the app, and a change-detection pass
    // per keystroke is a pass per character typed into every field.
    this.zone.runOutsideAngular(() =>
      window.addEventListener('keydown', (event) => this.onKeyDown(event))
    );
  }

  /** The keys for a control's tooltip, or nothing if it has no shortcut. */
  keysFor(id: ShortcutId): string {
    return this.shortcuts.find((one) => one.id === id)?.keys ?? '';
  }

  /**
   * A tooltip with its shortcut on the end: "Zoom In (+)".
   *
   * The name first and the key in brackets after it, because the name is what
   * a reader came to the tooltip for and the key is what they leave with.
   */
  tip(name: string, id: ShortcutId): string {
    const keys = this.keysFor(id);
    return keys ? `${name} (${keys})` : name;
  }

  /** The whole set, grouped, for the list that teaches them. */
  bySection(): { section: string; shortcuts: Shortcut[] }[] {
    const sections: string[] = [];
    for (const one of this.shortcuts) {
      if (!sections.includes(one.section)) sections.push(one.section);
    }
    return sections.map((section) => ({
      section,
      shortcuts: this.shortcuts.filter((one) => one.section === section),
    }));
  }

  private onKeyDown(event: KeyboardEvent): void {
    // A key pressed into a text field belongs to that field: Delete means
    // delete a character there, and Undo means undo the typing.
    if (this.typingInAField(event)) return;
    // And a key pressed while something stands over the canvas belongs to that
    // thing, or to nothing. These are the canvas's keys: with the Templates
    // dialog open, Delete was removing the selected joint behind it, out of
    // sight of the reader who pressed it.
    if (this.somethingIsOver()) return;

    const key = event.key.toLowerCase();
    const held = event.ctrlKey || event.metaKey;
    // Redo is Undo's key with Shift, as well as its own -- so it is looked for
    // first, or the plain Undo match would swallow it.
    const found =
      held && key === 'z' && event.shiftKey
        ? this.shortcuts.find((one) => one.id === 'history.redo')
        : this.shortcuts.find((one) => one.match.includes(key) && !!one.meta === held);
    if (!found) return;
    // A shortcut that reached us is a shortcut we are answering: Space would
    // otherwise scroll the page and Command-Z would reach the browser's own.
    event.preventDefault();
    this.zone.run(() => this.presses.next(found.id));
  }

  /**
   * Whether the canvas is covered by a conversation of its own.
   *
   * Only dialogs now. It used to also ask after the intro.js overlay, which
   * dimmed the whole page; the tutorial that replaced it is a drawer page
   * beside the canvas rather than over it, and the shortcuts stay live because
   * the student is meant to be using them on the drawing while it is open.
   */
  private somethingIsOver(): boolean {
    return this.dialog.openDialogs.length > 0;
  }

  /** Whether the keystroke was aimed at somewhere text is being entered. */
  private typingInAField(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null;
    if (!target) return false;
    const tag = target.tagName;
    // SELECT as well as the two that take typing: a dropdown answers to the
    // keyboard the whole time it has focus -- letters jump to an option, and
    // the digits that pick a mode here are letters to it.
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }
}
